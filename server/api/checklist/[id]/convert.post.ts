import { and, eq, getTableColumns, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ChecklistItem, Task, TaskLink } from '#shared/types/domain'
import { normalizeLink } from '#shared/utils/links'

const paramsSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event): Promise<{ task: Task; link: TaskLink; item: ChecklistItem }> => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const db = useDb()
  const now = new Date()

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ item: { ...getTableColumns(schema.checklistItems) }, parent: { ...getTableColumns(schema.tasks) } })
      .from(schema.checklistItems)
      .innerJoin(schema.tasks, eq(schema.checklistItems.taskId, schema.tasks.id))
      .where(and(eq(schema.checklistItems.id, id), eq(schema.tasks.userId, userId)))
    if (!existing) throw createError({ statusCode: 404 })
    const { item, parent } = existing

    const targetColumn = await defaultColumn(tx, userId)

    const title = item.title.trim().slice(0, 200)

    const [maxRow] = await tx
      .select({ maxPos: sql<number | null>`max(${schema.tasks.position})` })
      .from(schema.tasks)
      .where(eq(schema.tasks.columnId, targetColumn.id))
    const position = maxRow?.maxPos != null ? maxRow.maxPos + 1000 : 1000

    const [newTaskRow] = await tx
      .insert(schema.tasks)
      .values({
        userId,
        title,
        projectId: parent.projectId,
        columnId: targetColumn.id,
        position,
        size: null,
        ...(targetColumn.kind === 'done' ? { completedAt: now } : {}),
      })
      .returning()
    if (!newTaskRow) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

    await tx.insert(schema.taskStateEvents).values({
      taskId: newTaskRow.id,
      fromColumnId: null,
      toColumnId: targetColumn.id,
      toKind: targetColumn.kind,
      changedAt: now,
    })

    const normalized = normalizeLink(parent.id, newTaskRow.id, 'relates')
    if (!normalized) throw createError({ statusCode: 500, statusMessage: 'Cannot link task to itself' })
    const [linkRow] = await tx
      .insert(schema.taskLinks)
      .values({ fromTaskId: normalized.fromTaskId, toTaskId: normalized.toTaskId, type: 'relates' })
      .returning()
    if (!linkRow) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

    const [updatedItem] = await tx
      .update(schema.checklistItems)
      .set({ done: true, completedAt: now })
      .where(eq(schema.checklistItems.id, id))
      .returning()
    if (!updatedItem) throw createError({ statusCode: 500, statusMessage: 'Update failed' })

    await tx.update(schema.tasks).set({ updatedAt: now }).where(eq(schema.tasks.id, parent.id))

    return {
      task: toTask(newTaskRow, [], []),
      link: toTaskLink(linkRow),
      item: toChecklistItem(updatedItem),
    }
  })
})
