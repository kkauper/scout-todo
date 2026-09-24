import { TIMER_MIN_ENTRY_SECONDS, TIMER_STALE_AFTER_MS } from '../types/domain'
import type { RunningTimer } from '../types/domain'

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
