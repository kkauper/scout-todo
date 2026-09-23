import { asc, eq, getTableColumns } from 'drizzle-orm'
import type { BoardData, ChecklistItem } from '#shared/types/domain'

export default defineEventHandler(async (event): Promise<BoardData> => {
  const userId = await requireUserId(event)
  const db = useDb()
  const [projectRows, tagRows, columnRows, taskRows, taskTagRows, checklistRows] = await Promise.all([
    db.select().from(schema.projects).where(eq(schema.projects.userId, userId)),
    db.select().from(schema.tags).where(eq(schema.tags.userId, userId)),
    db.select().from(schema.boardColumns).where(eq(schema.boardColumns.userId, userId)).orderBy(asc(schema.boardColumns.position)),
    db.select().from(schema.tasks).where(eq(schema.tasks.userId, userId)).orderBy(asc(schema.tasks.columnId), asc(schema.tasks.position)),
    db
      .select({ taskId: schema.taskTags.taskId, tagId: schema.taskTags.tagId })
      .from(schema.taskTags)
      .innerJoin(schema.tasks, eq(schema.taskTags.taskId, schema.tasks.id))
      .where(eq(schema.tasks.userId, userId)),
    db
      .select({ ...getTableColumns(schema.checklistItems) })
      .from(schema.checklistItems)
      .innerJoin(schema.tasks, eq(schema.checklistItems.taskId, schema.tasks.id))
      .where(eq(schema.tasks.userId, userId))
      .orderBy(asc(schema.checklistItems.taskId), asc(schema.checklistItems.position)),
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

  return {
    projects: projectRows.map(toProject),
    tags: tagRows.map(toTag),
    columns: columnRows.map(toColumn),
    tasks: taskRows.map(t => toTask(t, tagsByTask.get(t.id) ?? [], checklistByTask.get(t.id) ?? [])),
  }
})
