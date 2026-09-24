import { and, asc, eq, getTableColumns, isNotNull, sql } from 'drizzle-orm'
import type { BoardData, ChecklistItem } from '#shared/types/domain'

export default defineEventHandler(async (event): Promise<BoardData> => {
  const userId = await requireUserId(event)
  const db = useDb()
  const now = new Date()

  return await db.transaction(async (tx) => {
    const staleClosedRaw = await closeStaleTimer(tx, userId, now)
    const timerStaleClosed = staleClosedRaw ? { taskId: staleClosedRaw.taskId, endedAt: staleClosedRaw.endedAt.toISOString(), discarded: staleClosedRaw.discarded } : null

    const [projectRows, tagRows, columnRows, taskRows, taskTagRows, checklistRows, linkRows, timeTotalRows, runningTimer] = await Promise.all([
      tx.select().from(schema.projects).where(eq(schema.projects.userId, userId)),
      tx.select().from(schema.tags).where(eq(schema.tags.userId, userId)),
      tx.select().from(schema.boardColumns).where(eq(schema.boardColumns.userId, userId)).orderBy(asc(schema.boardColumns.position)),
      tx.select().from(schema.tasks).where(eq(schema.tasks.userId, userId)).orderBy(asc(schema.tasks.columnId), asc(schema.tasks.position)),
      tx
        .select({ taskId: schema.taskTags.taskId, tagId: schema.taskTags.tagId })
        .from(schema.taskTags)
        .innerJoin(schema.tasks, eq(schema.taskTags.taskId, schema.tasks.id))
        .where(eq(schema.tasks.userId, userId)),
      tx
        .select({ ...getTableColumns(schema.checklistItems) })
        .from(schema.checklistItems)
        .innerJoin(schema.tasks, eq(schema.checklistItems.taskId, schema.tasks.id))
        .where(eq(schema.tasks.userId, userId))
        .orderBy(asc(schema.checklistItems.taskId), asc(schema.checklistItems.position)),
      tx
        .select({ ...getTableColumns(schema.taskLinks) })
        .from(schema.taskLinks)
        .innerJoin(schema.tasks, eq(schema.taskLinks.fromTaskId, schema.tasks.id))
        .where(eq(schema.tasks.userId, userId)),
      tx
        .select({
          taskId: schema.timeEntries.taskId,
          seconds: sql<number>`sum(extract(epoch from ${schema.timeEntries.endedAt} - ${schema.timeEntries.startedAt}))::int`,
        })
        .from(schema.timeEntries)
        .where(and(eq(schema.timeEntries.userId, userId), isNotNull(schema.timeEntries.endedAt)))
        .groupBy(schema.timeEntries.taskId),
      getRunningTimer(tx, userId),
    ])

    const tagsByTask = new Map<string, string[]>()
    for (const row of taskTagRows) {
      const list = tagsByTask.get(row.taskId) ?? []
      list.push(row.tagId)
      tagsByTask.set(row.taskId, list)
    }

    const checklistByTask = new Map<string, ChecklistItem[]>()
    for (const row of checklistRows) {
      const list = checklistByTask.get(row.taskId) ?? []
      list.push(toChecklistItem(row))
      checklistByTask.set(row.taskId, list)
    }

    const timeTotals: Record<string, number> = {}
    for (const row of timeTotalRows) {
      timeTotals[row.taskId] = row.seconds
    }

    return {
      projects: projectRows.map(toProject),
      tags: tagRows.map(toTag),
      columns: columnRows.map(toColumn),
      tasks: taskRows.map(t => toTask(t, tagsByTask.get(t.id) ?? [], checklistByTask.get(t.id) ?? [])),
      links: linkRows.map(toTaskLink),
      timeTotals,
      runningTimer,
      timerStaleClosed,
    }
  })
})
