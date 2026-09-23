import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const db = useDb()
  const [row] = await db.delete(schema.tags).where(and(eq(schema.tags.id, id), eq(schema.tags.userId, userId))).returning()
  if (!row) throw createError({ statusCode: 404 })
  setResponseStatus(event, 204)
  return null
})
