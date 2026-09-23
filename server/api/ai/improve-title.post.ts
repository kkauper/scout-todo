import { z } from 'zod'

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  projectName: z.string().max(80).nullable().optional(),
})

const formatSchema = {
  type: 'object',
  properties: {
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['suggestions'],
  additionalProperties: false,
}

const resultSchema = z.object({ suggestions: z.array(z.string()) })

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const { system, user } = improveTitlePrompt(body)

  const content = await aiChat(event, { system, user, schema: formatSchema })

  let parsed: z.infer<typeof resultSchema>
  try {
    parsed = resultSchema.parse(JSON.parse(content))
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: 'AI returned invalid output' })
  }

  const seen = new Set<string>()
  const suggestions: string[] = []
  for (const s of parsed.suggestions) {
    const trimmed = s.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    suggestions.push(trimmed.slice(0, 200))
    if (suggestions.length === 3) break
  }

  return { suggestions }
})
