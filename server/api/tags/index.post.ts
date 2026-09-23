import { z } from 'zod'
import { COLOR_KEYS } from '#shared/types/domain'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.enum(COLOR_KEYS).optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  try {
    const [row] = await db.insert(schema.tags).values({
      name: body.name,
      ...(body.color !== undefined ? { color: body.color } : {}),
    }).returning()
    if (!row) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })
    return toTag(row)
  }
  catch (e) {
    if (isUniqueViolation(e)) {
      throw createError({ statusCode: 409, statusMessage: 'Tag name already exists' })
    }
    throw e
  }
})
