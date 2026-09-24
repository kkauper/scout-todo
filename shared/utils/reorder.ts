/** Target index for moving an item by delta within a list of length n; returns null if it can't move. */
export function shiftIndex(currentIndex: number, delta: number, length: number): number | null {
  if (currentIndex < 0 || currentIndex >= length) return null
  const target = currentIndex + delta
  if (target < 0 || target > length - 1) return null
  return target
}

/**
 * Target index for moving `id` by `delta` within `orderedIds`, expressed in the index
 * semantics expected by `moveTask`/`positionAtIndex`: the index into the list with `id`
 * itself EXCLUDED. Returns null if `id` isn't found or the move would go out of bounds.
 */
export function withinColumnTargetIndex(orderedIds: string[], id: string, delta: -1 | 1): number | null {
  const currentIndex = orderedIds.indexOf(id)
  return shiftIndex(currentIndex, delta, orderedIds.length)
}

/** Adjacent column id in `columnIds` for direction -1|1 from `currentColumnId`, or null at the edge / not found. */
export function adjacentColumnId(columnIds: string[], currentColumnId: string, direction: -1 | 1): string | null {
  const index = columnIds.indexOf(currentColumnId)
  if (index === -1) return null
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= columnIds.length) return null
  return columnIds[targetIndex] ?? null
}
