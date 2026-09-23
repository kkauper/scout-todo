import type { BoardColumn, ColumnKind, Task } from '../types/domain'

export function transitionPatch(
  task: Pick<Task, 'columnId' | 'completedAt'>,
  fromKind: ColumnKind,
  to: Pick<BoardColumn, 'id' | 'kind'>,
  now: Date,
): { columnId: string; stateChangedAt: string; completedAt: string | null } | null {
  if (to.id === task.columnId) return null

  let completedAt: string | null
  if (to.kind === 'done') {
    completedAt = fromKind === 'done' ? (task.completedAt ?? now.toISOString()) : now.toISOString()
  }
  else {
    completedAt = null
  }

  return {
    columnId: to.id,
    stateChangedAt: now.toISOString(),
    completedAt,
  }
}

export function kindAfterKindChange(
  taskCompletedAt: string | null,
  oldKind: ColumnKind,
  newKind: ColumnKind,
  now: Date,
): string | null {
  if (oldKind !== 'done' && newKind === 'done') return now.toISOString()
  if (oldKind === 'done' && newKind !== 'done') return null
  return taskCompletedAt
}
