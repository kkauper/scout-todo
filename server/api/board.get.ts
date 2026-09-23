import { asc } from 'drizzle-orm'
import type { BoardData, ChecklistItem } from '#shared/types/domain'

export default defineEventHandler(async (): Promise<BoardData> => {
  const db = useDb()
  const [projectRows, tagRows, columnRows, taskRows, taskTagRows, checklistRows] = await Promise.all([
    db.select().from(schema.projects),
    db.select().from(schema.tags),
    db.select().from(schema.boardColumns).orderBy(asc(schema.boardColumns.position)),
    db.select().from(schema.tasks).orderBy(asc(schema.tasks.columnId), asc(schema.tasks.position)),
    db.select().from(schema.taskTags),
    db.select().from(schema.checklistItems).orderBy(asc(schema.checklistItems.taskId), asc(schema.checklistItems.position)),
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
