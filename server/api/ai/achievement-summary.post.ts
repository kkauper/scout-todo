import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import { z } from 'zod'
import { daysBetween } from '#shared/utils/dates'

const bodySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  projectId: z.union([z.uuid(), z.literal('none')]).optional(),
  periodLabel: z.string().max(60),
})

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const rangeStart = new Date(`${body.from}T00:00:00`)
  const rangeEnd = new Date(`${body.to}T23:59:59.999`)

  const doneColumnRows = await db
    .select({ id: schema.boardColumns.id })
    .from(schema.boardColumns)
    .where(and(eq(schema.boardColumns.kind, 'done'), eq(schema.boardColumns.userId, userId)))
  const doneColumnIds = doneColumnRows.map(c => c.id)

  if (doneColumnIds.length === 0) {
    return { text: '', count: 0 }
  }

  const conditions = [
    inArray(schema.tasks.columnId, doneColumnIds),
    gte(schema.tasks.completedAt, rangeStart),
    lte(schema.tasks.completedAt, rangeEnd),
    eq(schema.tasks.userId, userId),
  ]
  if (body.projectId === 'none') conditions.push(isNull(schema.tasks.projectId))
  else if (body.projectId !== undefined) conditions.push(eq(schema.tasks.projectId, body.projectId))

  const taskRows = await db
    .select()
    .from(schema.tasks)
    .where(and(...conditions))
    .orderBy(desc(schema.tasks.completedAt))
    .limit(150)

  if (taskRows.length === 0) {
    return { text: '', count: 0 }
  }

  const taskIds = taskRows.map(t => t.id)

  const [projectRows, tagRows] = await Promise.all([
    db.select().from(schema.projects).where(eq(schema.projects.userId, userId)),
    db
      .select({ taskId: schema.taskTags.taskId, tagName: schema.tags.name })
      .from(schema.taskTags)
      .innerJoin(schema.tags, eq(schema.taskTags.tagId, schema.tags.id))
      .where(inArray(schema.taskTags.taskId, taskIds)),
  ])

  const projectNameById = new Map(projectRows.map(p => [p.id, p.name]))
  const tagsByTask = new Map<string, string[]>()
  for (const row of tagRows) {
    const list = tagsByTask.get(row.taskId) ?? []
    list.push(row.tagName)
    tagsByTask.set(row.taskId, list)
  }

  const scopeName = body.projectId === undefined
    ? 'All projects'
    : body.projectId === 'none'
      ? 'No project'
      : (projectNameById.get(body.projectId) ?? 'Unknown project')

  const promptTasks = taskRows.map((t) => {
    const completedAt = t.completedAt!
    return {
      title: t.title,
      project: t.projectId ? (projectNameById.get(t.projectId) ?? null) : null,
      tags: tagsByTask.get(t.id) ?? [],
      description: t.description ?? null,
      cycleDays: round1(daysBetween(t.createdAt.toISOString(), completedAt)),
      completedAt: completedAt.toISOString(),
    }
  })

  const { system, user } = achievementPrompt({
    periodLabel: body.periodLabel,
    scopeName,
    tasks: promptTasks,
  })

  const text = await ollamaChat({ system, user })

  return { text, count: taskRows.length }
})
