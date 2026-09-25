import { TIMER_FUTURE_TOLERANCE_MS, TIMER_MAX_EDIT_SECONDS, TIMER_MIN_ENTRY_SECONDS, TIMER_STALE_AFTER_MS } from '../types/domain'
import type { EntryTimesError, RunningTimer } from '../types/domain'

export function isStale(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() > TIMER_STALE_AFTER_MS
}

export function durationSeconds(startedAt: string, endedAt: string): number {
  return Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
}

/** True when an entry ending at `endedAt` would have run for less than `TIMER_MIN_ENTRY_SECONDS`. */
export function isDiscardable(startedAt: Date | string, endedAt: Date | string): boolean {
  const seconds = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
  return seconds < TIMER_MIN_ENTRY_SECONDS
}

/** <60s "0 min"; <1h "12 min"; else "1 h 05 min". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return '0 min'
  const totalMinutes = Math.floor(seconds / 60)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours} h ${String(minutes).padStart(2, '0')} min`
}

/** "0:12:34" / "12:34:56". */
export function formatClock(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * Validates a (possibly edited) entry's start/end against `now`. Checks in order: start in the
 * future, end in the future, end before start, too short, too long. `endedAt === null` means a
 * running entry — only the start is checked. Returns the first failing check, or `null` if valid.
 */
export function validateEntryTimes(startedAt: Date | string, endedAt: Date | string | null, now: Date): EntryTimesError | null {
  const start = new Date(startedAt)
  const nowMs = now.getTime()

  if (start.getTime() > nowMs + TIMER_FUTURE_TOLERANCE_MS) return 'future'

  if (endedAt === null) return null

  const end = new Date(endedAt)
  if (end.getTime() > nowMs + TIMER_FUTURE_TOLERANCE_MS) return 'future'
  if (end.getTime() < start.getTime()) return 'end_before_start'

  const seconds = (end.getTime() - start.getTime()) / 1000
  if (seconds < TIMER_MIN_ENTRY_SECONDS) return 'too_short'
  if (seconds > TIMER_MAX_EDIT_SECONDS) return 'too_long'

  return null
}

/** ISO timestamp -> `YYYY-MM-DDTHH:mm` in local time, for `<input type="datetime-local">`. */
export function toDateTimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Inverse of `toDateTimeLocalValue`. Returns `null` for malformed or invalid input. */
export function fromDateTimeLocalValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

/**
 * Finished total (seconds) for a task plus the live running part, if the task's timer is currently
 * running. The running part is `now - startedAt`, but if the running entry has gone stale
 * (`isStale(lastSeenAt, now)`), it is capped at `lastSeenAt` instead of `now`.
 */
export function taskTrackedSeconds(
  taskId: string,
  totals: Record<string, number>,
  running: RunningTimer | null,
  now: Date,
): number {
  const finished = totals[taskId] ?? 0
  if (!running || running.taskId !== taskId) return finished

  const startedAt = new Date(running.startedAt)
  const lastSeenAt = new Date(running.lastSeenAt)
  const effectiveEnd = isStale(lastSeenAt, now) ? lastSeenAt : now
  const runningSeconds = Math.max(0, (effectiveEnd.getTime() - startedAt.getTime()) / 1000)
  return finished + runningSeconds
}
