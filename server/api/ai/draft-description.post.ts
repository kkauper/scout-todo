import { z } from 'zod'

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  projectName: z.string().max(80).nullable().optional(),
  tags: z.array(z.string()).max(10).optional(),
  existing: z.string().max(5000).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const { system, user } = draftDescriptionPrompt(body)

  const text = await aiChat(event, { system, user })

  return { text: text.slice(0, 5000) }
})
