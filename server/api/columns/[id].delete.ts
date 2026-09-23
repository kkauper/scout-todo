import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { transitionPatch } from '#shared/utils/transitions'

const paramsSchema = z.object({ id: z.uuid() })
const querySchema = z.object({ moveTo: z.uuid().optional() })

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { moveTo } = await getValidatedQuery(event, querySchema.parse)
  const db = useDb()
  const now = new Date()

  await db.transaction(async (tx) => {
    const [column] = await tx.select().from(schema.boardColumns).where(and(eq(schema.boardColumns.id, id), eq(schema.boardColumns.userId, userId))).for('update')
    if (!column) throw createError({ statusCode: 404 })

    const [totalRow] = await tx.select({ count: sql<number>`count(*)::int` }).from(schema.boardColumns).where(eq(schema.boardColumns.userId, userId))
    if ((totalRow?.count ?? 0) <= 1) {
      throw createError({ statusCode: 409, statusMessage: 'Cannot delete the last column' })
    }

    const tasksInColumn = await tx
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.columnId, id))
      .orderBy(asc(schema.tasks.position))

    if (tasksInColumn.length > 0) {
      if (!moveTo) throw createError({ statusCode: 400, statusMessage: 'moveTo required' })
      if (moveTo === id) throw createError({ statusCode: 400, statusMessage: 'Invalid moveTo column' })

      const [targetColumn] = await tx.select().from(schema.boardColumns).where(and(eq(schema.boardColumns.id, moveTo), eq(schema.boardColumns.userId, userId)))
      if (!targetColumn) throw createError({ statusCode: 400, statusMessage: 'Invalid moveTo column' })

      const [maxRow] = await tx
        .select({ maxPos: sql<number | null>`max(${schema.tasks.position})` })
        .from(schema.tasks)
        .where(eq(schema.tasks.columnId, moveTo))
      let position = maxRow?.maxPos ?? 0

      for (const task of tasksInColumn) {
        position += 1000
        const patch = transitionPatch(
          { columnId: task.columnId, completedAt: task.completedAt?.toISOString() ?? null },
          column.kind,
          { id: targetColumn.id, kind: targetColumn.kind },
          now,
        )

        await tx
          .update(schema.tasks)
          .set({
            columnId: targetColumn.id,
            position,
            updatedAt: now,
            ...(patch
              ? {
                  stateChangedAt: new Date(patch.stateChangedAt),
                  completedAt: patch.completedAt ? new Date(patch.completedAt) : null,
                }
              : {}),
          })
          .where(eq(schema.tasks.id, task.id))

        await tx.insert(schema.taskStateEvents).values({
          taskId: task.id,
          fromColumnId: id,
          toColumnId: targetColumn.id,
          toKind: targetColumn.kind,
          changedAt: now,
        })
      }
    }

    await tx.delete(schema.boardColumns).where(eq(schema.boardColumns.id, id))
  })

  setResponseStatus(event, 204)
  return null
})
