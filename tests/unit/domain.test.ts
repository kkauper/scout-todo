import { describe, it, expect } from 'vitest'
import { transitionPatch, kindAfterKindChange } from '../../shared/utils/transitions'
import { positionBetween, positionAtIndex } from '../../shared/utils/position'
import { localDateIso, daysBetween, isOverdue } from '../../shared/utils/dates'
import type { Task } from '../../shared/types/domain'

const NOW = new Date(2026, 8, 23, 12, 0, 0)

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString()
}

const OPEN_ID = crypto.randomUUID()
const ACTIVE_ID = crypto.randomUUID()
const DONE_A_ID = crypto.randomUUID()
const DONE_B_ID = crypto.randomUUID()

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    title: 't',
    description: null,
    projectId: null,
    columnId: OPEN_ID,
    position: 1000,
    deadline: null,
    size: null,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    stateChangedAt: daysAgo(1),
    completedAt: null,
    tagIds: [],
    checklist: [],
    ...overrides,
  }
}

describe('transitionPatch', () => {
  it('same column → null', () => {
    const task = makeTask({ columnId: OPEN_ID, completedAt: null })
    const result = transitionPatch(task, 'open', { id: OPEN_ID, kind: 'open' }, NOW)
    expect(result).toBeNull()
  })

  it('open → active: columnId set, stateChangedAt = NOW iso, completedAt stays null', () => {
    const task = makeTask({ columnId: OPEN_ID, completedAt: null })
    const result = transitionPatch(task, 'open', { id: ACTIVE_ID, kind: 'active' }, NOW)
    expect(result).not.toBeNull()
    expect(result?.columnId).toBe(ACTIVE_ID)
    expect(result?.stateChangedAt).toBe(NOW.toISOString())
    expect(result?.completedAt).toBeNull()
  })

  it('active → done: completedAt = NOW iso', () => {
    const task = makeTask({ columnId: ACTIVE_ID, completedAt: null })
    const result = transitionPatch(task, 'active', { id: DONE_A_ID, kind: 'done' }, NOW)
    expect(result).not.toBeNull()
    expect(result?.columnId).toBe(DONE_A_ID)
    expect(result?.completedAt).toBe(NOW.toISOString())
    expect(result?.stateChangedAt).toBe(NOW.toISOString())
  })

  it('done (completedAt set) → open: completedAt cleared', () => {
    const task = makeTask({ columnId: DONE_A_ID, completedAt: daysAgo(1) })
    const result = transitionPatch(task, 'done', { id: OPEN_ID, kind: 'open' }, NOW)
    expect(result).not.toBeNull()
    expect(result?.columnId).toBe(OPEN_ID)
    expect(result?.completedAt).toBeNull()
    expect(result?.stateChangedAt).toBe(NOW.toISOString())
  })

  it('done column A → done column B (completedAt set): keeps original completedAt', () => {
    const original = daysAgo(3)
    const task = makeTask({ columnId: DONE_A_ID, completedAt: original })
    const result = transitionPatch(task, 'done', { id: DONE_B_ID, kind: 'done' }, NOW)
    expect(result).not.toBeNull()
    expect(result?.columnId).toBe(DONE_B_ID)
    expect(result?.completedAt).toBe(original)
    expect(result?.stateChangedAt).toBe(NOW.toISOString())
  })

  it('done column A → done column B when completedAt null → now', () => {
    const task = makeTask({ columnId: DONE_A_ID, completedAt: null })
    const result = transitionPatch(task, 'done', { id: DONE_B_ID, kind: 'done' }, NOW)
    expect(result).not.toBeNull()
    expect(result?.completedAt).toBe(NOW.toISOString())
  })
})

describe('kindAfterKindChange', () => {
  it('non-done → done: now', () => {
    expect(kindAfterKindChange(null, 'open', 'done', NOW)).toBe(NOW.toISOString())
  })

  it('done → non-done: null', () => {
    expect(kindAfterKindChange(daysAgo(1), 'done', 'open', NOW)).toBeNull()
  })

  it('non-done → non-done: unchanged', () => {
    expect(kindAfterKindChange(daysAgo(1), 'open', 'active', NOW)).toBe(daysAgo(1))
  })
})

describe('positionBetween', () => {
  it('(null, null) → 1000', () => {
    expect(positionBetween(null, null)).toBe(1000)
  })

  it('(null, 500) → -500', () => {
    expect(positionBetween(null, 500)).toBe(-500)
  })

  it('(2000, null) → 3000', () => {
    expect(positionBetween(2000, null)).toBe(3000)
  })

  it('(1000, 2000) → 1500', () => {
    expect(positionBetween(1000, 2000)).toBe(1500)
  })
})

describe('positionAtIndex', () => {
  it('[1000,2000,3000], index 0 → 0', () => {
    expect(positionAtIndex([1000, 2000, 3000], 0)).toBe(0)
  })

  it('[1000,2000,3000], index 1 → 1500', () => {
    expect(positionAtIndex([1000, 2000, 3000], 1)).toBe(1500)
  })

  it('[1000,2000,3000], index 3 → 4000', () => {
    expect(positionAtIndex([1000, 2000, 3000], 3)).toBe(4000)
  })

  it('[], index 0 → 1000', () => {
    expect(positionAtIndex([], 0)).toBe(1000)
  })
})

describe('dates', () => {
  it('localDateIso(NOW) → "2026-09-23"', () => {
    expect(localDateIso(NOW)).toBe('2026-09-23')
  })

  it('daysBetween(daysAgo(3), NOW) → 3 (toBeCloseTo)', () => {
    expect(daysBetween(daysAgo(3), NOW)).toBeCloseTo(3, 1)
  })

  describe('isOverdue', () => {
    it('deadline "2026-09-22" kind active → true', () => {
      const task = makeTask({ deadline: '2026-09-22' })
      expect(isOverdue(task, 'active', NOW)).toBe(true)
    })

    it('deadline "2026-09-23" → false (due today not overdue)', () => {
      const task = makeTask({ deadline: '2026-09-23' })
      expect(isOverdue(task, 'active', NOW)).toBe(false)
    })

    it('deadline "2026-09-22" kind done → false', () => {
      const task = makeTask({ deadline: '2026-09-22' })
      expect(isOverdue(task, 'done', NOW)).toBe(false)
    })

    it('deadline null → false', () => {
      const task = makeTask({ deadline: null })
      expect(isOverdue(task, 'active', NOW)).toBe(false)
    })
  })
})
