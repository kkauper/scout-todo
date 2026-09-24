import { describe, it, expect } from 'vitest'
import { groupLinksForTask, isBlocked, normalizeLink } from '../../shared/utils/links'
import type { TaskLink } from '../../shared/types/domain'

const A = crypto.randomUUID()
const B = crypto.randomUUID()
const C = crypto.randomUUID()

function makeLink(overrides: Partial<TaskLink>): TaskLink {
  return {
    id: crypto.randomUUID(),
    fromTaskId: A,
    toTaskId: B,
    type: 'relates',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('normalizeLink', () => {
  it('self-link → null', () => {
    expect(normalizeLink(A, A, 'blocks')).toBeNull()
    expect(normalizeLink(A, A, 'relates')).toBeNull()
    expect(normalizeLink(A, A, 'duplicates')).toBeNull()
  })

  it('relates → sorted pair regardless of argument order', () => {
    const [lo, hi] = [A, B].sort()
    expect(normalizeLink(A, B, 'relates')).toEqual({ fromTaskId: lo, toTaskId: hi })
    expect(normalizeLink(B, A, 'relates')).toEqual({ fromTaskId: lo, toTaskId: hi })
  })

  it('blocks keeps the given direction', () => {
    expect(normalizeLink(A, B, 'blocks')).toEqual({ fromTaskId: A, toTaskId: B })
    expect(normalizeLink(B, A, 'blocks')).toEqual({ fromTaskId: B, toTaskId: A })
  })

  it('duplicates keeps the given direction', () => {
    expect(normalizeLink(A, B, 'duplicates')).toEqual({ fromTaskId: A, toTaskId: B })
    expect(normalizeLink(B, A, 'duplicates')).toEqual({ fromTaskId: B, toTaskId: A })
  })
})

describe('groupLinksForTask', () => {
  it('blocks: from-side sees it in blocks, to-side sees it in blockedBy', () => {
    const link = makeLink({ fromTaskId: A, toTaskId: B, type: 'blocks' })
    const fromA = groupLinksForTask(A, [link])
    expect(fromA.blocks).toEqual([{ link, otherTaskId: B }])
    expect(fromA.blockedBy).toEqual([])

    const fromB = groupLinksForTask(B, [link])
    expect(fromB.blockedBy).toEqual([{ link, otherTaskId: A }])
    expect(fromB.blocks).toEqual([])
  })

  it('duplicates: from-side sees it in duplicates, to-side sees it in duplicatedBy', () => {
    const link = makeLink({ fromTaskId: A, toTaskId: B, type: 'duplicates' })
    const fromA = groupLinksForTask(A, [link])
    expect(fromA.duplicates).toEqual([{ link, otherTaskId: B }])
    expect(fromA.duplicatedBy).toEqual([])

    const fromB = groupLinksForTask(B, [link])
    expect(fromB.duplicatedBy).toEqual([{ link, otherTaskId: A }])
    expect(fromB.duplicates).toEqual([])
  })

  it('relates: seen from either end in the relates group', () => {
    const link = makeLink({ fromTaskId: A, toTaskId: B, type: 'relates' })
    expect(groupLinksForTask(A, [link]).relates).toEqual([{ link, otherTaskId: B }])
    expect(groupLinksForTask(B, [link]).relates).toEqual([{ link, otherTaskId: A }])
  })

  it('a task unrelated to the link sees nothing', () => {
    const link = makeLink({ fromTaskId: A, toTaskId: B, type: 'blocks' })
    const groups = groupLinksForTask(C, [link])
    expect(groups).toEqual({ blocks: [], blockedBy: [], relates: [], duplicates: [], duplicatedBy: [] })
  })
})

describe('isBlocked', () => {
  const isDoneNoneDone = () => false
  const isDoneAllDone = () => true

  it('true when a blocker task is not done', () => {
    const link = makeLink({ fromTaskId: A, toTaskId: B, type: 'blocks' })
    expect(isBlocked(B, [link], isDoneNoneDone)).toBe(true)
  })

  it('false when the blocker task is done', () => {
    const link = makeLink({ fromTaskId: A, toTaskId: B, type: 'blocks' })
    expect(isBlocked(B, [link], isDoneAllDone)).toBe(false)
  })

  it('false when there is no blocks link for the task', () => {
    const link = makeLink({ fromTaskId: A, toTaskId: C, type: 'blocks' })
    expect(isBlocked(B, [link], isDoneNoneDone)).toBe(false)
  })
})
