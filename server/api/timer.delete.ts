import type { TimerState } from '#shared/types/domain'

export default defineEventHandler(async (event): Promise<TimerState> => {
  const userId = await requireUserId(event)
  const db = useDb()
  const now = new Date()

  return await db.transaction(async (tx) => {
    const staleClosedRaw = await closeStaleTimer(tx, userId, now)
    const staleClosed = staleClosedRaw ? { taskId: staleClosedRaw.taskId, endedAt: staleClosedRaw.endedAt.toISOString(), discarded: staleClosedRaw.discarded } : null

    const stoppedRaw = await stopRunningTimer(tx, userId, now)
    const stopped = stoppedRaw ? { taskId: stoppedRaw.taskId, discarded: stoppedRaw.discarded } : null

    return { running: null, staleClosed, stopped }
  })
})
