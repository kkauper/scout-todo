import { and, eq, isNotNull } from 'drizzle-orm'
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

  const [projectRows, columnRows, taskRows, taskTagRows, timeEntryRows] = await Promise.all([
    db.select().from(schema.projects).where(eq(schema.projects.userId, userId)),
    db.select().from(schema.boardColumns).where(eq(schema.boardColumns.userId, userId)),
    db.select().from(schema.tasks).where(eq(schema.tasks.userId, userId)),
    db
      .select({ taskId: schema.taskTags.taskId, tagId: schema.taskTags.tagId })
      .from(schema.taskTags)
      .innerJoin(schema.tasks, eq(schema.taskTags.taskId, schema.tasks.id))
      .where(eq(schema.tasks.userId, userId)),
    db
      .select({ taskId: schema.timeEntries.taskId, startedAt: schema.timeEntries.startedAt, endedAt: schema.timeEntries.endedAt })
      .from(schema.timeEntries)
      .where(and(eq(schema.timeEntries.userId, userId), isNotNull(schema.timeEntries.endedAt))),
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
  const timeEntries = timeEntryRows.map(row => ({
    taskId: row.taskId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt!.toISOString(),
  }))

  return computeKpis(tasks, projects, columns, new Date(), { projectId: query.projectId, timeEntries })
})
