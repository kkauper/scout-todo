import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { TimerState } from '#shared/types/domain'

const paramsSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event): Promise<TimerState> => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const db = useDb()
  const now = new Date()

  try {
    return await db.transaction(async (tx) => {
      const staleClosedRaw = await closeStaleTimer(tx, userId, now)
      const staleClosed = staleClosedRaw ? { taskId: staleClosedRaw.taskId, endedAt: staleClosedRaw.endedAt.toISOString(), discarded: staleClosedRaw.discarded } : null

      const [task] = await tx.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)))
      if (!task) throw createError({ statusCode: 404 })

      const running = await getRunningTimer(tx, userId)
      if (running && running.taskId === id) {
        return { running, staleClosed, stopped: null }
      }

      let stopped: { taskId: string; discarded: boolean } | null = null
      if (running) {
        const { discarded } = await endEntry(tx, { id: running.entryId, startedAt: running.startedAt }, now)
        stopped = { taskId: running.taskId, discarded }
      }

      const [inserted] = await tx
        .insert(schema.timeEntries)
        .values({ userId, taskId: id, startedAt: now, lastSeenAt: now })
        .returning()
      if (!inserted) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

      return {
        running: {
          entryId: inserted.id,
          taskId: inserted.taskId,
          startedAt: inserted.startedAt.toISOString(),
          lastSeenAt: inserted.lastSeenAt.toISOString(),
        },
        staleClosed,
        stopped,
      }
    })
  }
  catch (e) {
    if (isUniqueViolation(e)) {
      throw createError({ statusCode: 409, statusMessage: 'A timer is already running' })
    }
    throw e
  }
})
