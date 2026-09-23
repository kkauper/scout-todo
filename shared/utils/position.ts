export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1000
  if (before === null) return (after as number) - 1000
  if (after === null) return before + 1000
  return (before + after) / 2
}

export function positionAtIndex(sortedPositions: number[], index: number): number {
  const before = sortedPositions[index - 1] ?? null
  const after = sortedPositions[index] ?? null
  return positionBetween(before, after)
}
