import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const db = useDb()

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: schema.taskLinks.id })
      .from(schema.taskLinks)
      .innerJoin(schema.tasks, eq(schema.taskLinks.fromTaskId, schema.tasks.id))
      .where(and(eq(schema.taskLinks.id, id), eq(schema.tasks.userId, userId)))
    if (!existing) throw createError({ statusCode: 404 })

    const [row] = await tx.delete(schema.taskLinks).where(eq(schema.taskLinks.id, id)).returning()
    if (!row) throw createError({ statusCode: 404 })
  })

  setResponseStatus(event, 204)
  return null
})
