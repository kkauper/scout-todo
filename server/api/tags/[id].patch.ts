import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { COLOR_KEYS } from '#shared/types/domain'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    color: z.enum(COLOR_KEYS).optional(),
  })
  .refine(b => b.name !== undefined || b.color !== undefined, { message: 'At least one field required' })

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  try {
    const [row] = await db
      .update(schema.tags)
      .set(body)
      .where(eq(schema.tags.id, id))
      .returning()
    if (!row) throw createError({ statusCode: 404 })
    return toTag(row)
  }
  catch (e) {
    if (isUniqueViolation(e)) {
      throw createError({ statusCode: 409, statusMessage: 'Tag name already exists' })
    }
    throw e
  }
})
