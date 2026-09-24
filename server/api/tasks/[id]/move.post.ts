import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { transitionPatch } from '#shared/utils/transitions'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  columnId: z.uuid(),
  position: z.number().finite(),
})

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const now = new Date()

  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.tasks).where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId))).for('update')
    if (!row) return null

    const [fromColumn] = await tx.select().from(schema.boardColumns).where(eq(schema.boardColumns.id, row.columnId))
    if (!fromColumn) throw createError({ statusCode: 500, statusMessage: 'Task column missing' })

    const [toColumn] = await tx.select().from(schema.boardColumns).where(and(eq(schema.boardColumns.id, body.columnId), eq(schema.boardColumns.userId, userId)))
    if (!toColumn) throw createError({ statusCode: 400, statusMessage: 'Unknown columnId' })

    const patch = transitionPatch(
      { columnId: row.columnId, completedAt: row.completedAt?.toISOString() ?? null },
      fromColumn.kind,
      { id: toColumn.id, kind: toColumn.kind },
      now,
    )

    await tx
      .update(schema.tasks)
      .set({
        position: body.position,
        updatedAt: now,
        ...(patch
          ? {
              columnId: patch.columnId,
              stateChangedAt: new Date(patch.stateChangedAt),
              completedAt: patch.completedAt ? new Date(patch.completedAt) : null,
            }
          : {}),
      })
      .where(eq(schema.tasks.id, id))

    if (patch) {
      await tx.insert(schema.taskStateEvents).values({
        taskId: id,
        fromColumnId: row.columnId,
        toColumnId: toColumn.id,
        toKind: toColumn.kind,
        changedAt: now,
      })
    }

    if (toColumn.kind === 'done') {
      await stopRunningTimer(tx, userId, now, { taskId: id })
    }

    return { fromColumnId: row.columnId, toKind: toColumn.kind, patched: !!patch }
  })

  if (!result) throw createError({ statusCode: 404 })

  if (result.patched) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (useNitroApp().hooks as any).callHook('scout:task-moved', {
      taskId: id,
      fromColumnId: result.fromColumnId,
      toColumnId: body.columnId,
      toKind: result.toKind,
      at: now.toISOString(),
    })
  }

  const task = await loadTaskDto(db, userId, id)
  if (!task) throw createError({ statusCode: 404 })
  return task
})
