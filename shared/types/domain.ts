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

export const TIMER_STALE_AFTER_MS = 10 * 60_000
export const TIMER_HEARTBEAT_MS = 60_000
export const TIMER_MIN_ENTRY_SECONDS = 60
/** Longest duration an edited entry may have. Matches the manual-add cap (1440 min). */
export const TIMER_MAX_EDIT_SECONDS = 24 * 3600
/** Tolerance for client/server clock skew when rejecting future timestamps. */
export const TIMER_FUTURE_TOLERANCE_MS = 60_000
export const TIME_ENTRY_SOURCES = ['timer', 'manual'] as const
export type TimeEntrySource = (typeof TIME_ENTRY_SOURCES)[number]
export type EntryTimesError = 'future' | 'end_before_start' | 'too_short' | 'too_long'
export const ENTRY_TIMES_ERROR_MESSAGES: Record<EntryTimesError, string> = {
  future: 'Times can\'t be in the future.',
  end_before_start: 'End must be after start.',
  too_short: 'Entries must be at least 1 minute.',
  too_long: 'Entries can be at most 24 hours.',
}
export interface TimeEntry {
  id: string; taskId: string; startedAt: string; endedAt: string | null; lastSeenAt: string
  source: TimeEntrySource; editedAt: string | null; originalStartedAt: string | null; originalEndedAt: string | null
}
export interface RunningTimer { entryId: string; taskId: string; startedAt: string; lastSeenAt: string }
export interface TimerState {
  running: RunningTimer | null
  staleClosed: { taskId: string; endedAt: string; discarded: boolean } | null
  stopped: { taskId: string; discarded: boolean } | null
}

export interface BoardData {
  projects: Project[]; tags: Tag[]; tasks: Task[]; columns: BoardColumn[]; links: TaskLink[]
  timeTotals: Record<string, number>
  runningTimer: RunningTimer | null
  timerStaleClosed: { taskId: string; endedAt: string; discarded: boolean } | null
}
