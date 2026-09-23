import { describe, it, expect } from 'vitest'
import { computeKpis } from '../../shared/utils/kpi'
import type { BoardColumn, Project, Task } from '../../shared/types/domain'

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
