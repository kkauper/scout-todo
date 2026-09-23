import { z } from 'zod'
import type { Task } from '#shared/types/domain'
import { computeKpis } from '#shared/utils/kpi'

const querySchema = z.object({
  projectId: z.union([z.uuid(), z.literal('none')]).optional(),
})

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  const db = useDb()

  const [projectRows, columnRows, taskRows, taskTagRows] = await Promise.all([
    db.select().from(schema.projects),
    db.select().from(schema.boardColumns),
    db.select().from(schema.tasks),
    db.select().from(schema.taskTags),
  ])

  const tagsByTask = new Map<string, string[]>()
  for (const row of taskTagRows) {
    const list = tagsByTask.get(row.taskId) ?? []
    list.push(row.tagId)
    tagsByTask.set(row.taskId, list)
  }

  const tasks: Task[] = taskRows.map(t => toTask(t, tagsByTask.get(t.id) ?? []))
  const projects = projectRows.map(toProject)
  const columns = columnRows.map(toColumn)

  return computeKpis(tasks, projects, columns, new Date(), { projectId: query.projectId })
})
