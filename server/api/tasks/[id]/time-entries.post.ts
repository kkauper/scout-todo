import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { TimeEntry } from '#shared/types/domain'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  minutes: z.number().int().min(1).max(1440),
})

export default defineEventHandler(async (event): Promise<TimeEntry> => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const now = new Date()

  const entry = await db.transaction(async (tx) => {
    await closeStaleTimer(tx, userId, now)

    const [task] = await tx.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)))
    if (!task) throw createError({ statusCode: 404 })

    const startedAt = new Date(now.getTime() - body.minutes * 60_000)
    const [inserted] = await tx
      .insert(schema.timeEntries)
      .values({ userId, taskId: id, startedAt, endedAt: now, lastSeenAt: now })
      .returning()
    if (!inserted) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

    return toTimeEntry(inserted)
  })

  setResponseStatus(event, 201)
  return entry
})
