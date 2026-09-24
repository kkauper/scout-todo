import { eq } from 'drizzle-orm'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'

const bodySchema = z.object({
  anthropicApiKey: z.string().trim().min(20).max(300),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const userId = await requireUserId(event)
  const config = useRuntimeConfig(event)

  if (!config.encryptionKey || config.encryptionKey.length < 32) {
    throw createError({ statusCode: 500, statusMessage: 'Server is missing NUXT_ENCRYPTION_KEY (min 32 characters)' })
  }

  await enforceRateLimit(event, 'LOGIN_LIMITER', `aikey:${userId}`, 'Too many attempts. Try again in a minute.')

  const client = new Anthropic({ apiKey: body.anthropicApiKey })
  try {
    await client.models.retrieve(CLAUDE_MODEL)
  }
  catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw createError({ statusCode: 400, statusMessage: 'Anthropic rejected this API key' })
    }
    throw createError({ statusCode: 502, statusMessage: 'Could not verify the key with Anthropic' })
  }

  const encrypted = await encryptSecret(body.anthropicApiKey, config.encryptionKey, userId)
  const db = useDb()
  await db.update(schema.users).set({ anthropicApiKey: encrypted }).where(eq(schema.users.id, userId))

  const decrypted = await getUserAnthropicKey(event)
  return {
    claudeKeyConfigured: decrypted !== null,
    claudeKeyHint: decrypted !== null ? secretHint(decrypted) : null,
    encryptionConfigured: true,
  }
})
