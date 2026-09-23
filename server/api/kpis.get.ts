import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Task } from '#shared/types/domain'
import { computeKpis } from '#shared/utils/kpi'

const querySchema = z.object({
  projectId: z.union([z.uuid(), z.literal('none')]).optional(),
})

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const query = await getValidatedQuery(event, querySchema.parse)
  const db = useDb()

  const [projectRows, columnRows, taskRows, taskTagRows] = await Promise.all([
    db.select().from(schema.projects).where(eq(schema.projects.userId, userId)),
    db.select().from(schema.boardColumns).where(eq(schema.boardColumns.userId, userId)),
    db.select().from(schema.tasks).where(eq(schema.tasks.userId, userId)),
    db
      .select({ taskId: schema.taskTags.taskId, tagId: schema.taskTags.tagId })
      .from(schema.taskTags)
      .innerJoin(schema.tasks, eq(schema.taskTags.taskId, schema.tasks.id))
      .where(eq(schema.tasks.userId, userId)),
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
