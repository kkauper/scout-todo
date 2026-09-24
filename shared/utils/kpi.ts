import type { BoardColumn, ColorKey, ColumnKind, Project, Task, TaskSize } from '../types/domain'
import { COLUMN_KINDS, TASK_SIZES, TASK_SIZE_WEIGHTS } from '../types/domain'
import { daysBetween, localDateIso } from './dates'

export interface KpiReport {
  generatedAt: string
  scope: { projectId: string | null | 'none' }
  counts: {
    byColumn: { columnId: string; name: string; kind: ColumnKind; hidden: boolean; count: number }[]
    open: number
    wip: number
    done: number
    total: number
  }
  overdue: number
  cycleTime: { avgDays: number | null; medianDays: number | null; sample: number }
  throughput: {
    weekly: { weekStart: string; count: number; weight: number }[]
    last30Days: number
    thisMonth: number
  }
  aging: {
    wipAvgDays: number | null
    oldest: { taskId: string; title: string; columnName: string; days: number }[]
  }
  projects: { projectId: string | null; name: string; color: ColorKey | null; byKind: Record<ColumnKind, number>; total: number }[]
  size: {
    weights: Record<TaskSize, number>
    wip: Record<TaskSize | 'none', number>
    open: Record<TaskSize | 'none', number>
    doneLast30: Record<TaskSize | 'none', number>
    doneLast30Weight: number
    wipWeight: number
    unsizedShare: number | null
  }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

function emptyByKind(): Record<ColumnKind, number> {
  const r = {} as Record<ColumnKind, number>
  for (const k of COLUMN_KINDS) r[k] = 0
  return r
}

function emptySizeCounts(): Record<TaskSize | 'none', number> {
  const r = {} as Record<TaskSize | 'none', number>
  for (const s of TASK_SIZES) r[s] = 0
  r.none = 0
  return r
}

function weightOf(size: TaskSize | null): number {
  return size ? TASK_SIZE_WEIGHTS[size] : 0
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
  return sorted[mid] as number
}

/** Monday 00:00 local time of the week containing `d`. */
function startOfLocalWeek(d: Date): Date {
  const day = d.getDay() // 0 = Sun .. 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function computeKpis(
  tasks: Task[],
  projects: Project[],
  columns: BoardColumn[],
  now: Date,
  opts?: { projectId?: string | null | 'none'; weeks?: number },
): KpiReport {
  const projectIdOpt = opts?.projectId
  const weeks = opts?.weeks ?? 8

  const scoped = projectIdOpt === undefined
    ? tasks
    : projectIdOpt === 'none'
      ? tasks.filter(t => t.projectId === null)
      : tasks.filter(t => t.projectId === projectIdOpt)

  const columnsById = new Map(columns.map(c => [c.id, c]))
  const kindOf = (t: Task): ColumnKind => columnsById.get(t.columnId)?.kind ?? 'open'

  const sortedColumns = [...columns].sort((a, b) => a.position - b.position)
  const columnCounts = new Map<string, number>()
  for (const c of sortedColumns) columnCounts.set(c.id, 0)
  for (const t of scoped) {
    const col = columnsById.get(t.columnId)
    if (col) columnCounts.set(col.id, (columnCounts.get(col.id) ?? 0) + 1)
  }
  const byColumn = sortedColumns.map(c => ({
    columnId: c.id,
    name: c.name,
    kind: c.kind,
    hidden: c.hidden,
    count: columnCounts.get(c.id) ?? 0,
  }))

  let open = 0
  let wip = 0
  let done = 0
  for (const t of scoped) {
    const kind = kindOf(t)
    if (kind === 'open') open++
    else if (kind === 'active') wip++
    else done++
  }
  const total = scoped.length

  const nowIso = localDateIso(now)
  let overdue = 0
  for (const t of scoped) {
    if (t.deadline !== null && kindOf(t) !== 'done' && t.deadline < nowIso) overdue++
  }

  const doneTasks = scoped.filter(t => kindOf(t) === 'done' && t.completedAt !== null)
  const cycleDays = doneTasks.map(t => daysBetween(t.createdAt, new Date(t.completedAt!)))
  const avgDays = cycleDays.length ? round1(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) : null
  const medianDays = cycleDays.length ? round1(median(cycleDays)) : null

  const weekly: { weekStart: string; count: number; weight: number }[] = []
  const currentWeekStart = startOfLocalWeek(now)
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(currentWeekStart)
    start.setDate(start.getDate() - i * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const weekTasks = scoped.filter((t) => {
      if (t.completedAt === null) return false
      const c = new Date(t.completedAt)
      return c >= start && c < end
    })
    const count = weekTasks.length
    const weight = weekTasks.reduce((sum, t) => sum + weightOf(t.size), 0)
    weekly.push({ weekStart: localDateIso(start), count, weight })
  }

  const from30 = new Date(now.getTime() - 30 * 86_400_000)
  const last30Days = scoped.filter((t) => {
    if (t.completedAt === null) return false
    const c = new Date(t.completedAt)
    return c > from30 && c <= now
  }).length

  const thisMonth = scoped.filter((t) => {
    if (t.completedAt === null) return false
    const c = new Date(t.completedAt)
    return c.getFullYear() === now.getFullYear() && c.getMonth() === now.getMonth()
  }).length

  const wipTasks = scoped.filter(t => kindOf(t) === 'active')
  const wipDays = wipTasks.map(t => daysBetween(t.stateChangedAt, now))
  const wipAvgDays = wipDays.length ? round1(wipDays.reduce((a, b) => a + b, 0) / wipDays.length) : null

  const openTasks = scoped.filter(t => kindOf(t) === 'open')
  const doneLast30Tasks = scoped.filter((t) => {
    if (t.completedAt === null) return false
    const c = new Date(t.completedAt)
    return c > from30 && c <= now
  })

  const sizeWip = emptySizeCounts()
  for (const t of wipTasks) sizeWip[t.size ?? 'none']++

  const sizeOpen = emptySizeCounts()
  for (const t of openTasks) sizeOpen[t.size ?? 'none']++

  const sizeDoneLast30 = emptySizeCounts()
  for (const t of doneLast30Tasks) sizeDoneLast30[t.size ?? 'none']++

  const doneLast30Weight = doneLast30Tasks.reduce((sum, t) => sum + weightOf(t.size), 0)
  const wipWeight = wipTasks.reduce((sum, t) => sum + weightOf(t.size), 0)

  const notDoneCount = open + wip
  const unsizedNotDone = sizeOpen.none + sizeWip.none
  const unsizedShare = notDoneCount > 0 ? unsizedNotDone / notDoneCount : null

  const oldest = scoped
    .filter(t => kindOf(t) !== 'done')
    .map(t => ({
      taskId: t.id,
      title: t.title,
      columnName: columnsById.get(t.columnId)?.name ?? 'Unknown',
      days: round1(daysBetween(t.stateChangedAt, now)),
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 5)

  let projectsOut: KpiReport['projects'] = []
  if (projectIdOpt === undefined) {
    const byProject = new Map<string | null, { name: string; color: ColorKey | null; byKind: Record<ColumnKind, number>; total: number }>()
    for (const p of projects) {
      byProject.set(p.id, { name: p.name, color: p.color, byKind: emptyByKind(), total: 0 })
    }
    let unassignedCount = 0
    for (const t of tasks) {
      if (t.projectId === null) {
        unassignedCount++
        continue
      }
      const entry = byProject.get(t.projectId)
      if (!entry) continue
      entry.byKind[kindOf(t)]++
      entry.total++
    }
    if (unassignedCount > 0) {
      const unassignedEntry = { name: 'No project', color: null as ColorKey | null, byKind: emptyByKind(), total: 0 }
      for (const t of tasks) {
        if (t.projectId === null) {
          unassignedEntry.byKind[kindOf(t)]++
          unassignedEntry.total++
        }
      }
      byProject.set(null, unassignedEntry)
    }

    projectsOut = Array.from(byProject.entries())
      .map(([id, v]) => ({ projectId: id, name: v.name, color: v.color, byKind: v.byKind, total: v.total }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }

  return {
    generatedAt: now.toISOString(),
    scope: { projectId: projectIdOpt === undefined ? null : projectIdOpt },
    counts: { byColumn, open, wip, done, total },
    overdue,
    cycleTime: { avgDays, medianDays, sample: cycleDays.length },
    throughput: { weekly, last30Days, thisMonth },
    aging: { wipAvgDays, oldest },
    projects: projectsOut,
    size: {
      weights: TASK_SIZE_WEIGHTS,
      wip: sizeWip,
      open: sizeOpen,
      doneLast30: sizeDoneLast30,
      doneLast30Weight,
      wipWeight,
      unsizedShare,
    },
  }
}
