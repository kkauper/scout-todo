import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const db = useDb()
  const [row] = await db.delete(schema.tasks).where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId))).returning()
  if (!row) throw createError({ statusCode: 404 })
  setResponseStatus(event, 204)
  return null
})
