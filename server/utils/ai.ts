import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import Anthropic from '@anthropic-ai/sdk'

export async function getUserAnthropicKey(event: H3Event): Promise<string | null> {
  const config = useRuntimeConfig(event)
  if (!config.encryptionKey || config.encryptionKey.length < 32) return null

  const userId = await requireUserId(event)
  const db = useDb()
  const [user] = await db
    .select({ anthropicApiKey: schema.users.anthropicApiKey })
    .from(schema.users)
    .where(eq(schema.users.id, userId))

  if (!user?.anthropicApiKey) return null
  return decryptSecret(user.anthropicApiKey, config.encryptionKey, userId)
}

async function claudeChat(apiKey: string, input: {
  system: string
  user: string
  schema?: Record<string, unknown>
}): Promise<string> {
  const client = new Anthropic({ apiKey })

  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      system: input.system,
      messages: [{ role: 'user', content: input.user }],
      ...(input.schema ? { output_config: { format: { type: 'json_schema' as const, schema: input.schema } } } : {}),
    })
  }
  catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw createError({ statusCode: 400, statusMessage: 'Claude API key was rejected — update it in AI settings' })
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      throw createError({ statusCode: 403, statusMessage: 'Claude API key was rejected — update it in AI settings' })
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw createError({ statusCode: 429, statusMessage: 'Claude rate limit — try again shortly' })
    }
    // APIConnectionError extends APIError, so it must be checked first.
    if (error instanceof Anthropic.APIConnectionError) {
      throw createError({ statusCode: 503, statusMessage: 'Could not reach Claude' })
    }
    if (error instanceof Anthropic.APIError) {
      throw createError({ statusCode: 502, statusMessage: 'Claude API error' })
    }
    throw error
  }

  if (response.stop_reason === 'refusal') {
    throw createError({ statusCode: 422, statusMessage: 'Claude declined this request' })
  }

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')
}

export async function aiChat(event: H3Event, input: {
  system: string
  user: string
  schema?: Record<string, unknown>
  temperature?: number
}): Promise<string> {
  const userId = await requireUserId(event)
  await enforceRateLimit(event, 'AI_LIMITER', `ai:${userId}`, 'Too many AI requests. Try again in a minute.')

  const apiKey = await getUserAnthropicKey(event)
  if (apiKey) {
    return claudeChat(apiKey, { system: input.system, user: input.user, schema: input.schema })
  }
  return ollamaChat({ system: input.system, user: input.user, format: input.schema, temperature: input.temperature })
}

export async function aiStatus(event: H3Event): Promise<{ provider: 'claude' | 'ollama', available: boolean, model: string, modelInstalled: boolean }> {
  const apiKey = await getUserAnthropicKey(event)
  if (apiKey) {
    return { provider: 'claude', available: true, model: CLAUDE_MODEL, modelInstalled: true }
  }
  return { provider: 'ollama', ...(await ollamaStatus()) }
}
