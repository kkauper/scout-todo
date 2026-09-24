import { and, eq, isNull } from 'drizzle-orm'
import type { RunningTimer, TimeEntry } from '#shared/types/domain'
import { isDiscardable, isStale } from '#shared/utils/timer'
import * as schema from '../db/schema'
import type { Db, Tx } from './owner'

/**
 * Ends a running time entry at `endedAt`. If the resulting duration is shorter than
 * `TIMER_MIN_ENTRY_SECONDS` (`isDiscardable`), the entry is deleted instead of closed. Both
 * operations are guarded by `ended_at IS NULL` so they only affect a still-running entry.
 */
export async function endEntry(tx: Tx, entry: { id: string; startedAt: Date | string }, endedAt: Date): Promise<{ discarded: boolean; entry: TimeEntry | null }> {
  if (isDiscardable(entry.startedAt, endedAt)) {
    await tx
      .delete(schema.timeEntries)
      .where(and(eq(schema.timeEntries.id, entry.id), isNull(schema.timeEntries.endedAt)))
    return { discarded: true, entry: null }
  }

  const [updated] = await tx
    .update(schema.timeEntries)
    .set({ endedAt })
    .where(and(eq(schema.timeEntries.id, entry.id), isNull(schema.timeEntries.endedAt)))
    .returning()

  return { discarded: false, entry: updated ? toTimeEntry(updated) : null }
}

/**
 * Closes a user's running timer if it has gone stale (`last_seen_at` older than
 * `TIMER_STALE_AFTER_MS`), setting `ended_at = last_seen_at` (or discarding it if that duration is
 * under `TIMER_MIN_ENTRY_SECONDS`). Returns the closed entry's `taskId`/`endedAt`/`discarded` when
 * it fired a stale close, otherwise `null`. Must run first, inside the same transaction, before
 * every timer endpoint and `/api/board`.
 */
export async function closeStaleTimer(tx: Tx, userId: string, now: Date): Promise<{ taskId: string; endedAt: Date; discarded: boolean } | null> {
  const [running] = await tx
    .select()
    .from(schema.timeEntries)
    .where(and(eq(schema.timeEntries.userId, userId), isNull(schema.timeEntries.endedAt)))

  if (!running) return null
  if (!isStale(running.lastSeenAt, now)) return null

  const { discarded } = await endEntry(tx, running, running.lastSeenAt)

  return { taskId: running.taskId, endedAt: running.lastSeenAt, discarded }
}

export async function getRunningTimer(db: Db | Tx, userId: string): Promise<RunningTimer | null> {
  const [running] = await db
    .select()
    .from(schema.timeEntries)
    .where(and(eq(schema.timeEntries.userId, userId), isNull(schema.timeEntries.endedAt)))

  if (!running) return null
  return {
    entryId: running.id,
    taskId: running.taskId,
    startedAt: running.startedAt.toISOString(),
    lastSeenAt: running.lastSeenAt.toISOString(),
  }
}

/**
 * Stops the user's running timer (`ended_at = now`, or discards it if that duration is under
 * `TIMER_MIN_ENTRY_SECONDS`). If `opts.taskId` is given, only stops it when it is running on that
 * task; otherwise leaves it untouched and returns `null`. Returns the stopped entry's
 * `taskId`/`discarded`/`entry`, or `null` when there was nothing to stop.
 */
export async function stopRunningTimer(tx: Tx, userId: string, now: Date, opts?: { taskId?: string }): Promise<{ taskId: string; discarded: boolean; entry: TimeEntry | null } | null> {
  const [running] = await tx
    .select()
    .from(schema.timeEntries)
    .where(and(eq(schema.timeEntries.userId, userId), isNull(schema.timeEntries.endedAt)))

  if (!running) return null
  if (opts?.taskId !== undefined && running.taskId !== opts.taskId) return null

  const result = await endEntry(tx, running, now)

  return { taskId: running.taskId, ...result }
}
