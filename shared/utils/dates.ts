import type { ColumnKind, Task } from '../types/domain'

export function localDateIso(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso)
  return (to.getTime() - from.getTime()) / 86_400_000
}

export function isOverdue(task: Pick<Task, 'deadline'>, kind: ColumnKind, now: Date): boolean {
  return task.deadline !== null && kind !== 'done' && task.deadline < localDateIso(now)
}
