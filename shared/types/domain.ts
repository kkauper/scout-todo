export const COLUMN_KINDS = ['open', 'active', 'done'] as const
export type ColumnKind = (typeof COLUMN_KINDS)[number]
export const COLUMN_KIND_LABELS: Record<ColumnKind, string> = {
  open: 'Open',
  active: 'Active',
  done: 'Done',
}
export interface BoardColumn { id: string; name: string; kind: ColumnKind; position: number; hidden: boolean; createdAt: string; updatedAt: string }
export const DEFAULT_COLUMNS: { name: string; kind: ColumnKind }[] = [
  { name: 'Backlog', kind: 'open' },
  { name: 'To do', kind: 'open' },
  { name: 'In progress', kind: 'active' },
  { name: 'Review', kind: 'active' },
  { name: 'Done', kind: 'done' },
]
export const COLOR_KEYS = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'violet', 'pink'] as const
export type ColorKey = (typeof COLOR_KEYS)[number]

export interface Project { id: string; name: string; color: ColorKey; createdAt: string; updatedAt: string }
export interface Tag { id: string; name: string; color: ColorKey; createdAt: string }
export interface ChecklistItem {
  id: string; taskId: string; title: string; done: boolean; position: number
  createdAt: string; completedAt: string | null
}
export const TASK_SIZES = ['xs', 's', 'm', 'l', 'xl'] as const
export type TaskSize = (typeof TASK_SIZES)[number]
export const TASK_SIZE_LABELS: Record<TaskSize, string> = { xs: 'XS', s: 'S', m: 'M', l: 'L', xl: 'XL' }
export const TASK_SIZE_HINTS: Record<TaskSize, string> = {
  xs: 'An hour or two',
  s: 'About half a day',
  m: 'A day or two',
  l: 'Several days, up to a week',
  xl: 'More than a week — consider splitting',
}
/** Relative effort weights (each size ≈ double the previous). Used only for sums in reports. */
export const TASK_SIZE_WEIGHTS: Record<TaskSize, number> = { xs: 1, s: 2, m: 4, l: 8, xl: 16 }

export interface Task {
  id: string; title: string; description: string | null
  projectId: string | null; columnId: string; position: number
  deadline: string | null
  size: TaskSize | null
  createdAt: string; updatedAt: string; stateChangedAt: string; completedAt: string | null
  tagIds: string[]
  checklist: ChecklistItem[]
}
export interface StateEvent { taskId: string; fromColumnId: string | null; toColumnId: string | null; toKind: ColumnKind; changedAt: string }

export const TASK_LINK_TYPES = ['blocks', 'relates', 'duplicates'] as const
export type TaskLinkType = (typeof TASK_LINK_TYPES)[number]
export interface TaskLink { id: string; fromTaskId: string; toTaskId: string; type: TaskLinkType; createdAt: string }

export interface BoardData { projects: Project[]; tags: Tag[]; tasks: Task[]; columns: BoardColumn[]; links: TaskLink[] }
