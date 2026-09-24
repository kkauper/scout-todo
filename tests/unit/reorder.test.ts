import { describe, it, expect } from 'vitest'
import { adjacentColumnId, shiftIndex, withinColumnTargetIndex } from '../../shared/utils/reorder'
import { positionAtIndex } from '../../shared/utils/position'

describe('shiftIndex', () => {
  it('moves down by one within bounds', () => {
    expect(shiftIndex(1, 1, 4)).toBe(2)
  })

  it('moves up by one within bounds', () => {
    expect(shiftIndex(2, -1, 4)).toBe(1)
  })

  it('cannot move up past the top', () => {
    expect(shiftIndex(0, -1, 4)).toBeNull()
  })

  it('cannot move down past the bottom', () => {
    expect(shiftIndex(3, 1, 4)).toBeNull()
  })

  it('single-item list cannot move in either direction', () => {
    expect(shiftIndex(0, -1, 1)).toBeNull()
    expect(shiftIndex(0, 1, 1)).toBeNull()
  })

  it('returns null when currentIndex is out of range', () => {
    expect(shiftIndex(-1, 1, 4)).toBeNull()
    expect(shiftIndex(4, 1, 4)).toBeNull()
  })
})

describe('adjacentColumnId', () => {
  const columns = ['a', 'b', 'c']

  it('returns the next column id', () => {
    expect(adjacentColumnId(columns, 'a', 1)).toBe('b')
  })

  it('returns the previous column id', () => {
    expect(adjacentColumnId(columns, 'b', -1)).toBe('a')
  })

  it('null at the last column moving right', () => {
    expect(adjacentColumnId(columns, 'c', 1)).toBeNull()
  })

  it('null at the first column moving left', () => {
    expect(adjacentColumnId(columns, 'a', -1)).toBeNull()
  })

  it('null when currentColumnId is not found', () => {
    expect(adjacentColumnId(columns, 'z', 1)).toBeNull()
  })

  it('single-column list cannot move in either direction', () => {
    expect(adjacentColumnId(['only'], 'only', 1)).toBeNull()
    expect(adjacentColumnId(['only'], 'only', -1)).toBeNull()
  })
})

describe('withinColumnTargetIndex', () => {
  it('returns null when the id is not found', () => {
    expect(withinColumnTargetIndex(['a', 'b', 'c'], 'z', 1)).toBeNull()
  })

  it('cannot move the first item up', () => {
    expect(withinColumnTargetIndex(['a', 'b', 'c', 'd'], 'a', -1)).toBeNull()
  })

  it('cannot move the last item down', () => {
    expect(withinColumnTargetIndex(['a', 'b', 'c', 'd'], 'd', 1)).toBeNull()
  })

  it('single-item list cannot move in either direction', () => {
    expect(withinColumnTargetIndex(['a'], 'a', -1)).toBeNull()
    expect(withinColumnTargetIndex(['a'], 'a', 1)).toBeNull()
  })
})

/**
 * Applies `withinColumnTargetIndex` together with `positionAtIndex` (the same combination
 * used by the board store's `moveTaskWithinColumn` + `moveTask`) to a simulated list of
 * tasks and returns the resulting id order, proving the two functions compose correctly
 * in `moveTask`'s "index excludes the moved item" semantics. Returns null when the move
 * is rejected.
 */
function applyMove(orderedIds: string[], moveId: string, delta: -1 | 1): string[] | null {
  const targetIndex = withinColumnTargetIndex(orderedIds, moveId, delta)
  if (targetIndex === null) return null

  const positions = new Map(orderedIds.map((id, i) => [id, i]))
  const excludingIds = orderedIds.filter((id) => id !== moveId)
  const excludingPositions = excludingIds.map((id) => positions.get(id)!)
  positions.set(moveId, positionAtIndex(excludingPositions, targetIndex))

  return [...orderedIds].sort((a, b) => positions.get(a)! - positions.get(b)!)
}

describe('withinColumnTargetIndex + positionAtIndex (end-to-end order)', () => {
  it('length 4: move b down swaps b and c', () => {
    expect(applyMove(['a', 'b', 'c', 'd'], 'b', 1)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('length 4: move c up swaps c and b (same result as moving b down)', () => {
    expect(applyMove(['a', 'b', 'c', 'd'], 'c', -1)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('length 4: moving the top item up is rejected', () => {
    expect(applyMove(['a', 'b', 'c', 'd'], 'a', -1)).toBeNull()
  })

  it('length 4: moving the bottom item down is rejected', () => {
    expect(applyMove(['a', 'b', 'c', 'd'], 'd', 1)).toBeNull()
  })

  it('length 3: move the middle item down', () => {
    expect(applyMove(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
  })

  it('length 3: move the middle item up', () => {
    expect(applyMove(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
  })

  it('length 2: move the first item down swaps the pair', () => {
    expect(applyMove(['a', 'b'], 'a', 1)).toEqual(['b', 'a'])
  })

  it('length 2: move the last item up swaps the pair', () => {
    expect(applyMove(['a', 'b'], 'b', -1)).toEqual(['b', 'a'])
  })

  it('length 1: cannot move in either direction', () => {
    expect(applyMove(['a'], 'a', -1)).toBeNull()
    expect(applyMove(['a'], 'a', 1)).toBeNull()
  })
})
