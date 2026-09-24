import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { TimeEntry } from '#shared/types/domain'

const paramsSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event): Promise<TimeEntry[]> => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const db = useDb()
  const now = new Date()

  return await db.transaction(async (tx) => {
    await closeStaleTimer(tx, userId, now)

    const [task] = await tx.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)))
    if (!task) throw createError({ statusCode: 404 })

    const rows = await tx
      .select()
      .from(schema.timeEntries)
      .where(and(eq(schema.timeEntries.taskId, id), eq(schema.timeEntries.userId, userId)))
      .orderBy(desc(schema.timeEntries.startedAt))

    return rows.map(toTimeEntry)
  })
})
