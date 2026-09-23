import { and, eq, getTableColumns } from 'drizzle-orm'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const db = useDb()
  const now = new Date()

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ ...getTableColumns(schema.checklistItems) })
      .from(schema.checklistItems)
      .innerJoin(schema.tasks, eq(schema.checklistItems.taskId, schema.tasks.id))
      .where(and(eq(schema.checklistItems.id, id), eq(schema.tasks.userId, userId)))
    if (!existing) throw createError({ statusCode: 404 })

    const [row] = await tx.delete(schema.checklistItems).where(eq(schema.checklistItems.id, id)).returning()
    if (!row) throw createError({ statusCode: 404 })
    await tx.update(schema.tasks).set({ updatedAt: now }).where(eq(schema.tasks.id, row.taskId))
  })

  setResponseStatus(event, 204)
  return null
})
