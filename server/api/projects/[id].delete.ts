import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const db = useDb()
  const [row] = await db.delete(schema.projects).where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId))).returning()
  if (!row) throw createError({ statusCode: 404 })
  setResponseStatus(event, 204)
  return null
})
