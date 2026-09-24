import { and, eq, isNull } from 'drizzle-orm'
import type { TimerState } from '#shared/types/domain'

export default defineEventHandler(async (event): Promise<TimerState> => {
  const userId = await requireUserId(event)
  const db = useDb()
  const now = new Date()

  return await db.transaction(async (tx) => {
    const staleClosedRaw = await closeStaleTimer(tx, userId, now)
    const staleClosed = staleClosedRaw ? { taskId: staleClosedRaw.taskId, endedAt: staleClosedRaw.endedAt.toISOString(), discarded: staleClosedRaw.discarded } : null

    const running = await getRunningTimer(tx, userId)
    if (!running) return { running: null, staleClosed, stopped: null }

    await tx
      .update(schema.timeEntries)
      .set({ lastSeenAt: now })
      .where(and(eq(schema.timeEntries.id, running.entryId), isNull(schema.timeEntries.endedAt)))

    return { running: { ...running, lastSeenAt: now.toISOString() }, staleClosed, stopped: null }
  })
})
