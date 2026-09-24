import { describe, it, expect } from 'vitest'
import { isStale, durationSeconds, formatDuration, formatClock, taskTrackedSeconds, isDiscardable } from '../../shared/utils/timer'
import { TIMER_STALE_AFTER_MS } from '../../shared/types/domain'
import type { RunningTimer } from '../../shared/types/domain'

const NOW = new Date(2026, 8, 23, 12, 0, 0)

describe('isStale', () => {
  it('exactly at the stale boundary is not stale (strictly greater than)', () => {
    const lastSeenAt = new Date(NOW.getTime() - TIMER_STALE_AFTER_MS)
    expect(isStale(lastSeenAt, NOW)).toBe(false)
  })

  it('one millisecond past the boundary is stale', () => {
    const lastSeenAt = new Date(NOW.getTime() - TIMER_STALE_AFTER_MS - 1)
    expect(isStale(lastSeenAt, NOW)).toBe(true)
  })

  it('well within the window is not stale', () => {
    const lastSeenAt = new Date(NOW.getTime() - 60_000)
    expect(isStale(lastSeenAt, NOW)).toBe(false)
  })
})

describe('durationSeconds', () => {
  it('computes whole seconds between two ISO timestamps', () => {
    const startedAt = NOW.toISOString()
    const endedAt = new Date(NOW.getTime() + 90_000).toISOString()
    expect(durationSeconds(startedAt, endedAt)).toBe(90)
  })
})

describe('isDiscardable', () => {
  it('0 s -> true', () => {
    const startedAt = NOW
    const endedAt = NOW
    expect(isDiscardable(startedAt, endedAt)).toBe(true)
  })

  it('59 s -> true', () => {
    const startedAt = NOW
    const endedAt = new Date(NOW.getTime() + 59_000)
    expect(isDiscardable(startedAt, endedAt)).toBe(true)
  })

  it('59.999 s -> true', () => {
    const startedAt = NOW
    const endedAt = new Date(NOW.getTime() + 59_999)
    expect(isDiscardable(startedAt, endedAt)).toBe(true)
  })

  it('60 s -> false', () => {
    const startedAt = NOW
    const endedAt = new Date(NOW.getTime() + 60_000)
    expect(isDiscardable(startedAt, endedAt)).toBe(false)
  })

  it('61 s -> false', () => {
    const startedAt = NOW
    const endedAt = new Date(NOW.getTime() + 61_000)
    expect(isDiscardable(startedAt, endedAt)).toBe(false)
  })
})

describe('formatDuration', () => {
  it('0 s -> "0 min"', () => {
    expect(formatDuration(0)).toBe('0 min')
  })

  it('59 s -> "0 min"', () => {
    expect(formatDuration(59)).toBe('0 min')
  })

  it('60 s -> "1 min"', () => {
    expect(formatDuration(60)).toBe('1 min')
  })

  it('12 min -> "12 min"', () => {
    expect(formatDuration(12 * 60)).toBe('12 min')
  })

  it('3599 s -> "59 min"', () => {
    expect(formatDuration(3599)).toBe('59 min')
  })

  it('3600 s -> "1 h 00 min"', () => {
    expect(formatDuration(3600)).toBe('1 h 00 min')
  })

  it('36000 s -> "10 h 00 min"', () => {
    expect(formatDuration(36_000)).toBe('10 h 00 min')
  })
})

describe('formatClock', () => {
  it('0 s -> "0:00:00"', () => {
    expect(formatClock(0)).toBe('0:00:00')
  })

  it('59 s -> "0:00:59"', () => {
    expect(formatClock(59)).toBe('0:00:59')
  })

  it('60 s -> "0:01:00"', () => {
    expect(formatClock(60)).toBe('0:01:00')
  })

  it('3599 s -> "0:59:59"', () => {
    expect(formatClock(3599)).toBe('0:59:59')
  })

  it('3600 s -> "1:00:00"', () => {
    expect(formatClock(3600)).toBe('1:00:00')
  })

  it('36000 s -> "10:00:00"', () => {
    expect(formatClock(36_000)).toBe('10:00:00')
  })
})

describe('taskTrackedSeconds', () => {
  const TASK_A = crypto.randomUUID()
  const TASK_B = crypto.randomUUID()

  it('no running timer -> just the finished total', () => {
    const totals = { [TASK_A]: 120 }
    expect(taskTrackedSeconds(TASK_A, totals, null, NOW)).toBe(120)
  })

  it('running timer on a different task -> unaffected', () => {
    const totals = { [TASK_A]: 120 }
    const running: RunningTimer = {
      entryId: crypto.randomUUID(),
      taskId: TASK_B,
      startedAt: new Date(NOW.getTime() - 60_000).toISOString(),
      lastSeenAt: NOW.toISOString(),
    }
    expect(taskTrackedSeconds(TASK_A, totals, running, NOW)).toBe(120)
  })

  it('running timer on this task -> finished total + live elapsed', () => {
    const totals = { [TASK_A]: 120 }
    const running: RunningTimer = {
      entryId: crypto.randomUUID(),
      taskId: TASK_A,
      startedAt: new Date(NOW.getTime() - 30_000).toISOString(),
      lastSeenAt: NOW.toISOString(),
    }
    expect(taskTrackedSeconds(TASK_A, totals, running, NOW)).toBe(150)
  })

  it('running timer gone stale -> live part capped at lastSeenAt, not now', () => {
    const totals: Record<string, number> = {}
    const lastSeenAt = new Date(NOW.getTime() - TIMER_STALE_AFTER_MS - 60_000)
    const running: RunningTimer = {
      entryId: crypto.randomUUID(),
      taskId: TASK_A,
      startedAt: new Date(lastSeenAt.getTime() - 300_000).toISOString(),
      lastSeenAt: lastSeenAt.toISOString(),
    }
    // elapsed should be capped at lastSeenAt - startedAt = 300s, ignoring the much larger now - startedAt
    expect(taskTrackedSeconds(TASK_A, totals, running, NOW)).toBe(300)
  })
})
