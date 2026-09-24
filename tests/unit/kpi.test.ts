import { describe, it, expect } from 'vitest'
import { computeKpis } from '../../shared/utils/kpi'
import type { BoardColumn, Project, Task } from '../../shared/types/domain'
import { TASK_SIZE_WEIGHTS } from '../../shared/types/domain'

const NOW = new Date(2026, 8, 23, 12, 0, 0)

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString()
}

const BACKLOG_ID = crypto.randomUUID()
const TODO_ID = crypto.randomUUID()
const IN_PROGRESS_ID = crypto.randomUUID()
const REVIEW_ID = crypto.randomUUID()
const DONE_ID = crypto.randomUUID()
const ICEBOX_ID = crypto.randomUUID()

const columns: BoardColumn[] = [
  { id: BACKLOG_ID, name: 'Backlog', kind: 'open', position: 1000, hidden: false, createdAt: daysAgo(10), updatedAt: daysAgo(10) },
  { id: TODO_ID, name: 'To do', kind: 'open', position: 2000, hidden: false, createdAt: daysAgo(10), updatedAt: daysAgo(10) },
  { id: IN_PROGRESS_ID, name: 'In progress', kind: 'active', position: 3000, hidden: false, createdAt: daysAgo(10), updatedAt: daysAgo(10) },
  { id: REVIEW_ID, name: 'Review', kind: 'active', position: 4000, hidden: false, createdAt: daysAgo(10), updatedAt: daysAgo(10) },
  { id: DONE_ID, name: 'Done', kind: 'done', position: 5000, hidden: false, createdAt: daysAgo(10), updatedAt: daysAgo(10) },
  { id: ICEBOX_ID, name: 'Icebox', kind: 'open', position: 6000, hidden: true, createdAt: daysAgo(10), updatedAt: daysAgo(10) },
]

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    title: 't',
    description: null,
    projectId: null,
    columnId: BACKLOG_ID,
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

// Fixture data
const P1_ID = crypto.randomUUID()
const P2_ID = crypto.randomUUID()
const P3_ID = crypto.randomUUID()

const projects: Project[] = [
  { id: P1_ID, name: 'Alpha', color: 'blue', createdAt: daysAgo(10), updatedAt: daysAgo(10) },
  { id: P2_ID, name: 'Beta', color: 'green', createdAt: daysAgo(10), updatedAt: daysAgo(10) },
  { id: P3_ID, name: 'Empty', color: 'red', createdAt: daysAgo(10), updatedAt: daysAgo(10) },
]

const a = makeTask({ projectId: P1_ID, columnId: BACKLOG_ID, title: 'a' })
const b = makeTask({ projectId: P1_ID, columnId: TODO_ID, deadline: '2026-09-01', title: 'b' })
const c = makeTask({ projectId: P1_ID, columnId: IN_PROGRESS_ID, stateChangedAt: daysAgo(4), title: 'c' })
const d = makeTask({ projectId: P2_ID, columnId: REVIEW_ID, stateChangedAt: daysAgo(2), title: 'd' })
const e = makeTask({
  projectId: P2_ID,
  columnId: DONE_ID,
  createdAt: daysAgo(10),
  completedAt: daysAgo(2),
  title: 'e',
})
const f = makeTask({
  projectId: P1_ID,
  columnId: DONE_ID,
  createdAt: daysAgo(6),
  completedAt: daysAgo(1),
  title: 'f',
})
const g = makeTask({
  projectId: null,
  columnId: DONE_ID,
  createdAt: daysAgo(70),
  completedAt: daysAgo(40),
  deadline: '2026-01-01',
  title: 'g',
})
const h = makeTask({ projectId: null, columnId: TODO_ID, title: 'h' })

const tasks = [a, b, c, d, e, f, g, h]

describe('computeKpis', () => {
  it('counts.byColumn and totals', () => {
    const kpi = computeKpis(tasks, projects, columns, NOW)
    const countOf = (id: string) => kpi.counts.byColumn.find(col => col.columnId === id)?.count
    expect(countOf(BACKLOG_ID)).toBe(1)
    expect(countOf(TODO_ID)).toBe(2)
    expect(countOf(IN_PROGRESS_ID)).toBe(1)
    expect(countOf(REVIEW_ID)).toBe(1)
    expect(countOf(DONE_ID)).toBe(3)
    expect(countOf(ICEBOX_ID)).toBe(0)
    expect(kpi.counts.byColumn.length).toBe(6)
    // byColumn is in column position order
    expect(kpi.counts.byColumn.map(col => col.columnId)).toEqual([
      BACKLOG_ID, TODO_ID, IN_PROGRESS_ID, REVIEW_ID, DONE_ID, ICEBOX_ID,
    ])
    expect(kpi.counts.open).toBe(3)
    expect(kpi.counts.wip).toBe(2)
    expect(kpi.counts.done).toBe(3)
    expect(kpi.counts.total).toBe(8)
  })

  it('hidden column still counted', () => {
    const icebox = makeTask({ projectId: null, columnId: ICEBOX_ID, title: 'icebox' })
    const kpi = computeKpis([...tasks, icebox], projects, columns, NOW)
    const iceboxCol = kpi.counts.byColumn.find(col => col.columnId === ICEBOX_ID)
    expect(iceboxCol).toEqual({ columnId: ICEBOX_ID, name: 'Icebox', kind: 'open', hidden: true, count: 1 })
    expect(kpi.counts.open).toBe(4)
    expect(kpi.counts.total).toBe(9)
  })

  it('task with unknown columnId counts as open', () => {
    const unknown = makeTask({ projectId: null, columnId: crypto.randomUUID(), title: 'unknown' })
    const kpi = computeKpis([unknown], projects, columns, NOW)
    expect(kpi.counts.open).toBe(1)
    expect(kpi.counts.total).toBe(1)
    expect(kpi.counts.byColumn.every(col => col.count === 0)).toBe(true)
  })

  it('overdue = 1', () => {
    const kpi = computeKpis(tasks, projects, columns, NOW)
    expect(kpi.overdue).toBe(1)
  })

  it('cycleTime: sample 3; durations 8, 5, 30 → avgDays 14.3, medianDays 8', () => {
    const kpi = computeKpis(tasks, projects, columns, NOW)
    expect(kpi.cycleTime.sample).toBe(3)
    expect(kpi.cycleTime.avgDays).toBe(14.3)
    expect(kpi.cycleTime.medianDays).toBe(8)
  })

  it('throughput.weekly: last bucket weekStart "2026-09-21", last bucket count 2, sum = 3', () => {
    const kpi = computeKpis(tasks, projects, columns, NOW)
    expect(kpi.throughput.weekly.length).toBe(8)
    const lastBucket = kpi.throughput.weekly[kpi.throughput.weekly.length - 1]
    expect(lastBucket.weekStart).toBe('2026-09-21')
    expect(lastBucket.count).toBe(2)

    // Sum of all weekly counts should be 3 (e, f, g)
    const totalInWeekly = kpi.throughput.weekly.reduce((sum, w) => sum + w.count, 0)
    expect(totalInWeekly).toBe(3)

    // Find bucket containing g (weekStart '2026-08-10')
    const gBucket = kpi.throughput.weekly.find(w => w.weekStart === '2026-08-10')
    expect(gBucket?.count).toBe(1)
  })

  it('last30Days = 2; thisMonth = 2', () => {
    const kpi = computeKpis(tasks, projects, columns, NOW)
    expect(kpi.throughput.last30Days).toBe(2)
    expect(kpi.throughput.thisMonth).toBe(2)
  })

  it('aging.wipAvgDays = 3 (c 4d, d 2d); aging.oldest[0].taskId = oldest; length ≤ 5; no done', () => {
    const kpi = computeKpis(tasks, projects, columns, NOW)
    expect(kpi.aging.wipAvgDays).toBe(3)

    // c is 4 days in column, d is 2 days, so oldest should be c
    expect(kpi.aging.oldest.length).toBeGreaterThan(0)
    expect(kpi.aging.oldest[0].taskId).toBe(c.id)
    expect(kpi.aging.oldest[0].columnName).toBe('In progress')
    expect(kpi.aging.oldest.length).toBeLessThanOrEqual(5)

    // No done tasks in oldest
    const doneIds = new Set([e.id, f.id, g.id])
    const doneInOldest = kpi.aging.oldest.filter(o => doneIds.has(o.taskId))
    expect(doneInOldest.length).toBe(0)
  })

  it('projects: order Alpha, Beta, No project, Empty (total desc, then name asc); byKind per project', () => {
    const kpi = computeKpis(tasks, projects, columns, NOW)
    expect(kpi.projects.length).toBe(4)

    const alphaProject = kpi.projects.find(p => p.projectId === P1_ID)
    expect(alphaProject?.name).toBe('Alpha')
    expect(alphaProject?.total).toBe(4)
    expect(alphaProject?.byKind).toEqual({ open: 2, active: 1, done: 1 })

    const betaProject = kpi.projects.find(p => p.projectId === P2_ID)
    expect(betaProject?.name).toBe('Beta')
    expect(betaProject?.total).toBe(2)
    expect(betaProject?.byKind).toEqual({ open: 0, active: 1, done: 1 })

    const noProjectRow = kpi.projects.find(p => p.projectId === null && p.name === 'No project')
    expect(noProjectRow?.total).toBe(2)
    expect(noProjectRow?.byKind).toEqual({ open: 1, active: 0, done: 1 })

    const emptyProject = kpi.projects.find(p => p.projectId === P3_ID)
    expect(emptyProject?.name).toBe('Empty')
    expect(emptyProject?.total).toBe(0)
    expect(emptyProject?.byKind).toEqual({ open: 0, active: 0, done: 0 })

    // Verify order
    expect(kpi.projects[0].name).toBe('Alpha')
    expect(kpi.projects[1].name).toBe('Beta')
    expect(kpi.projects[2].name).toBe('No project')
    expect(kpi.projects[3].name).toBe('Empty')
  })

  it('scoped { projectId: P1.id } → total 4, done 1, overdue 1, projects []', () => {
    const kpi = computeKpis(tasks, projects, columns, NOW, { projectId: P1_ID })
    expect(kpi.counts.total).toBe(4)
    expect(kpi.counts.done).toBe(1)
    expect(kpi.overdue).toBe(1)
    expect(kpi.projects.length).toBe(0)
    expect(kpi.scope.projectId).toBe(P1_ID)
  })

  it('scoped { projectId: "none" } → total 2 (g, h), done 1', () => {
    const kpi = computeKpis(tasks, projects, columns, NOW, { projectId: 'none' })
    expect(kpi.counts.total).toBe(2)
    expect(kpi.counts.done).toBe(1)
    expect(kpi.scope.projectId).toBe('none')
  })

  it('empty task list → cycleTime avg/median null, sample 0, wipAvgDays null, all counts 0, weekly 8 buckets all 0', () => {
    const kpi = computeKpis([], projects, columns, NOW)
    expect(kpi.cycleTime.avgDays).toBeNull()
    expect(kpi.cycleTime.medianDays).toBeNull()
    expect(kpi.cycleTime.sample).toBe(0)
    expect(kpi.aging.wipAvgDays).toBeNull()
    expect(kpi.counts.open).toBe(0)
    expect(kpi.counts.wip).toBe(0)
    expect(kpi.counts.done).toBe(0)
    expect(kpi.counts.total).toBe(0)
    for (const col of kpi.counts.byColumn) {
      expect(col.count).toBe(0)
    }
    expect(kpi.throughput.weekly.length).toBe(8)
    for (const bucket of kpi.throughput.weekly) {
      expect(bucket.count).toBe(0)
    }
  })

  it('{ weeks: 4 } → weekly length 4', () => {
    const kpi = computeKpis(tasks, projects, columns, NOW, { weeks: 4 })
    expect(kpi.throughput.weekly.length).toBe(4)
  })
})

describe('computeKpis size', () => {
  const s1 = makeTask({ projectId: P1_ID, columnId: BACKLOG_ID, size: 'xs', title: 's1' })
  const s2 = makeTask({ projectId: P1_ID, columnId: TODO_ID, size: null, title: 's2' })
  const s3 = makeTask({ projectId: P1_ID, columnId: IN_PROGRESS_ID, size: 'm', title: 's3' })
  const s4 = makeTask({ projectId: P1_ID, columnId: REVIEW_ID, size: null, title: 's4' })
  const s5 = makeTask({ projectId: P2_ID, columnId: DONE_ID, completedAt: daysAgo(2), size: 'l', title: 's5' })
  const s6 = makeTask({ projectId: P2_ID, columnId: DONE_ID, completedAt: daysAgo(1), size: null, title: 's6' })
  const s7 = makeTask({ projectId: P2_ID, columnId: DONE_ID, completedAt: daysAgo(40), size: 'xl', title: 's7' })

  const sizeTasks = [s1, s2, s3, s4, s5, s6, s7]

  it('weights exposes TASK_SIZE_WEIGHTS', () => {
    const kpi = computeKpis(sizeTasks, projects, columns, NOW)
    expect(kpi.size.weights).toEqual(TASK_SIZE_WEIGHTS)
  })

  it('open/wip/doneLast30 counts per size incl none', () => {
    const kpi = computeKpis(sizeTasks, projects, columns, NOW)
    expect(kpi.size.open).toEqual({ xs: 1, s: 0, m: 0, l: 0, xl: 0, none: 1 })
    expect(kpi.size.wip).toEqual({ xs: 0, s: 0, m: 1, l: 0, xl: 0, none: 1 })
    expect(kpi.size.doneLast30).toEqual({ xs: 0, s: 0, m: 0, l: 1, xl: 0, none: 1 })
  })

  it('doneLast30Weight and wipWeight sum weights; unsized contributes 0', () => {
    const kpi = computeKpis(sizeTasks, projects, columns, NOW)
    expect(kpi.size.doneLast30Weight).toBe(8) // l=8, none=0
    expect(kpi.size.wipWeight).toBe(4) // m=4, none=0
  })

  it('unsizedShare = unsized / (open + active) not-done tasks', () => {
    const kpi = computeKpis(sizeTasks, projects, columns, NOW)
    expect(kpi.size.unsizedShare).toBe(0.5) // 2 unsized of 4 not-done
  })

  it('unsizedShare is null when there are no open/active tasks', () => {
    const onlyDone = [s5, s6, s7]
    const kpi = computeKpis(onlyDone, projects, columns, NOW)
    expect(kpi.size.unsizedShare).toBeNull()
  })

  it('throughput.weekly[i].weight sums weights for that week; unsized counts as 0', () => {
    const kpi = computeKpis(sizeTasks, projects, columns, NOW)
    const lastBucket = kpi.throughput.weekly[kpi.throughput.weekly.length - 1]
    expect(lastBucket.weekStart).toBe('2026-09-21')
    expect(lastBucket.weight).toBe(8) // s5 (l=8) + s6 (none=0)
  })

  it('scope respected: projectId P1 excludes done tasks assigned to P2', () => {
    const kpi = computeKpis(sizeTasks, projects, columns, NOW, { projectId: P1_ID })
    expect(kpi.size.open).toEqual({ xs: 1, s: 0, m: 0, l: 0, xl: 0, none: 1 })
    expect(kpi.size.wip).toEqual({ xs: 0, s: 0, m: 1, l: 0, xl: 0, none: 1 })
    expect(kpi.size.doneLast30).toEqual({ xs: 0, s: 0, m: 0, l: 0, xl: 0, none: 0 })
    expect(kpi.size.doneLast30Weight).toBe(0)
    expect(kpi.size.unsizedShare).toBe(0.5)
  })
})

describe('computeKpis time', () => {
  // Done tasks, sized, for time-tracking tests
  const t1 = makeTask({ projectId: P1_ID, columnId: DONE_ID, completedAt: daysAgo(2), size: 'm', title: 't1' })
  const t2 = makeTask({ projectId: P1_ID, columnId: DONE_ID, completedAt: daysAgo(1), size: 'm', title: 't2' })
  const t3 = makeTask({ projectId: P1_ID, columnId: DONE_ID, completedAt: daysAgo(1), size: null, title: 't3 (no time)' })
  const t4 = makeTask({ projectId: P2_ID, columnId: DONE_ID, completedAt: daysAgo(1), size: 'l', title: 't4 (out of scope)' })
  const t5 = makeTask({ projectId: P1_ID, columnId: BACKLOG_ID, size: 'xs', title: 't5 (not done)' })

  const timeTasks = [t1, t2, t3, t4, t5]

  it('opts.timeEntries undefined → zeros/nulls', () => {
    const kpi = computeKpis(timeTasks, projects, columns, NOW)
    expect(kpi.time.last30DaysSeconds).toBe(0)
    expect(kpi.time.trackedDoneTasks).toBe(0)
    expect(kpi.time.doneTasksWithoutTime).toBe(0)
    for (const size of ['xs', 's', 'm', 'l', 'xl', 'none'] as const) {
      expect(kpi.time.avgDoneSecondsBySize[size]).toBeNull()
    }
  })

  it('window clipping: entry spanning the 30-day boundary counts only the part inside the window', () => {
    // Entry starts 31 days ago (before the window), ends 29 days ago (inside the window, endedAt > from30).
    // Only the part from the window start (30 days ago) to endedAt (29 days ago) counts: 1 day.
    const entries = [
      { taskId: t1.id, startedAt: daysAgo(31), endedAt: daysAgo(29) },
    ]
    const kpi = computeKpis(timeTasks, projects, columns, NOW, { timeEntries: entries })
    expect(kpi.time.last30DaysSeconds).toBe(1 * 86_400)
  })

  it('entry entirely before the window (endedAt <= from30) is excluded', () => {
    const entries = [
      { taskId: t1.id, startedAt: daysAgo(40), endedAt: daysAgo(31) },
    ]
    const kpi = computeKpis(timeTasks, projects, columns, NOW, { timeEntries: entries })
    expect(kpi.time.last30DaysSeconds).toBe(0)
  })

  it('entry fully inside the window counts in full', () => {
    const entries = [
      { taskId: t1.id, startedAt: daysAgo(5), endedAt: daysAgo(4) },
    ]
    const kpi = computeKpis(timeTasks, projects, columns, NOW, { timeEntries: entries })
    expect(kpi.time.last30DaysSeconds).toBe(1 * 86_400)
  })

  it('scope filtering: entries for out-of-scope tasks are ignored', () => {
    const entries = [
      { taskId: t1.id, startedAt: daysAgo(2), endedAt: daysAgo(1) }, // in scope (P1)
      { taskId: t4.id, startedAt: daysAgo(2), endedAt: daysAgo(1) }, // out of scope when filtered to P1
    ]
    const global = computeKpis(timeTasks, projects, columns, NOW, { timeEntries: entries })
    expect(global.time.last30DaysSeconds).toBe(2 * 86_400)

    const scopedToP1 = computeKpis(timeTasks, projects, columns, NOW, { projectId: P1_ID, timeEntries: entries })
    expect(scopedToP1.time.last30DaysSeconds).toBe(1 * 86_400)
  })

  it('avgDoneSecondsBySize: averages per size incl. none; null when no such task; doneTasksWithoutTime counts 0-tracked done tasks', () => {
    const entries = [
      { taskId: t1.id, startedAt: daysAgo(3), endedAt: daysAgo(2) }, // t1 (size m): 1 day
      { taskId: t2.id, startedAt: daysAgo(2), endedAt: daysAgo(1) }, // t2 (size m): 1 day
      // t3 (size none): no entries → doneTasksWithoutTime
      { taskId: t4.id, startedAt: daysAgo(2), endedAt: daysAgo(1) }, // t4 (size l, project P2)
    ]
    const kpi = computeKpis(timeTasks, projects, columns, NOW, { timeEntries: entries })

    expect(kpi.time.avgDoneSecondsBySize.m).toBe(1 * 86_400)
    expect(kpi.time.avgDoneSecondsBySize.l).toBe(1 * 86_400)
    expect(kpi.time.avgDoneSecondsBySize.xs).toBeNull()
    expect(kpi.time.avgDoneSecondsBySize.s).toBeNull()
    expect(kpi.time.avgDoneSecondsBySize.xl).toBeNull()
    expect(kpi.time.avgDoneSecondsBySize.none).toBeNull() // t3 has 0 tracked time → not counted in average

    expect(kpi.time.trackedDoneTasks).toBe(3) // t1, t2, t4
    expect(kpi.time.doneTasksWithoutTime).toBe(1) // t3
  })

  it('no-entries case: opts.timeEntries = [] → zeros/nulls, no crash', () => {
    const kpi = computeKpis(timeTasks, projects, columns, NOW, { timeEntries: [] })
    expect(kpi.time.last30DaysSeconds).toBe(0)
    expect(kpi.time.trackedDoneTasks).toBe(0)
    expect(kpi.time.doneTasksWithoutTime).toBe(4) // t1, t2, t3, t4 done with no tracked time
    for (const size of ['xs', 's', 'm', 'l', 'xl', 'none'] as const) {
      expect(kpi.time.avgDoneSecondsBySize[size]).toBeNull()
    }
  })
})
