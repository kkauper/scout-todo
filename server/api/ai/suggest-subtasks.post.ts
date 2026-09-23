import { z } from 'zod'

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
})

const formatSchema = {
  type: 'object',
  properties: {
    items: { type: 'array', items: { type: 'string' } },
  },
  required: ['items'],
}

const resultSchema = z.object({ items: z.array(z.string()) })

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const { system, user } = subtasksPrompt(body)

  const content = await ollamaChat({ system, user, format: formatSchema })

  let parsed: z.infer<typeof resultSchema>
  try {
    parsed = resultSchema.parse(JSON.parse(content))
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: 'AI returned invalid output' })
  }

  const seen = new Set<string>()
  const items: string[] = []
  for (const s of parsed.items) {
    const trimmed = s.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    items.push(trimmed.slice(0, 200))
    if (items.length === 7) break
  }

  return { items }
})
