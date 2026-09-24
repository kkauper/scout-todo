import { describe, it, expect } from 'vitest'
import { createSearchIndex, searchTasks, toSearchDocs } from '../../shared/utils/search'
import type { BoardColumn, ChecklistItem, Project, Tag, Task } from '../../shared/types/domain'

const NOW = new Date(2026, 8, 23, 12, 0, 0)

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString()
}

const OPEN_COLUMN_ID = crypto.randomUUID()
const DONE_COLUMN_ID = crypto.randomUUID()

const columns: BoardColumn[] = [
  { id: OPEN_COLUMN_ID, name: 'To do', kind: 'open', position: 1000, hidden: false, createdAt: daysAgo(10), updatedAt: daysAgo(10) },
  { id: DONE_COLUMN_ID, name: 'Done', kind: 'done', position: 2000, hidden: false, createdAt: daysAgo(10), updatedAt: daysAgo(10) },
]

function makeChecklistItem(overrides: Partial<ChecklistItem> & { title: string }): ChecklistItem {
  return {
    id: crypto.randomUUID(),
    taskId: crypto.randomUUID(),
    done: false,
    position: 1000,
    createdAt: daysAgo(1),
    completedAt: null,
    ...overrides,
  }
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    title: 't',
    description: null,
    projectId: null,
    columnId: OPEN_COLUMN_ID,
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

function buildIndex(tasks: Task[], options: { projects?: Project[]; tags?: Tag[] } = {}) {
  const projectById = new Map((options.projects ?? []).map((p) => [p.id, p]))
  const tagById = new Map((options.tags ?? []).map((t) => [t.id, t]))
  const columnById = new Map(columns.map((c) => [c.id, c]))
  const docs = toSearchDocs(tasks, projectById, tagById, columnById)
  return createSearchIndex(docs)
}

describe('searchTasks', () => {
  it('ranks a title match above a description-only match of the same word', () => {
    const titleTask = makeTask({ title: 'Widget' })
    const descriptionTask = makeTask({ title: 'Other', description: 'widget parts needed' })
    const index = buildIndex([titleTask, descriptionTask])

    const hits = searchTasks(index, 'widget')
    const ids = hits.map((h) => h.taskId)

    expect(ids).toContain(titleTask.id)
    expect(ids).toContain(descriptionTask.id)
    expect(ids.indexOf(titleTask.id)).toBeLessThan(ids.indexOf(descriptionTask.id))
  })

  it('tolerates typos', () => {
    const task = makeTask({ title: 'Deadline review' })
    const index = buildIndex([task])

    const hits = searchTasks(index, 'dealine')

    expect(hits.map((h) => h.taskId)).toContain(task.id)
  })

  it('ranks a done task below an equally-matching open task', () => {
    const doneTask = makeTask({ title: 'Report', columnId: DONE_COLUMN_ID })
    const openTask = makeTask({ title: 'Report', columnId: OPEN_COLUMN_ID })
    // done task listed first to prove the penalty (not input order) determines ranking
    const index = buildIndex([doneTask, openTask])

    const hits = searchTasks(index, 'Report')

    expect(hits).toHaveLength(2)
    expect(hits[0]!.taskId).toBe(openTask.id)
    expect(hits[1]!.taskId).toBe(doneTask.id)
  })

  it('returns no hits for a query shorter than 2 characters', () => {
    const task = makeTask({ title: 'Report' })
    const index = buildIndex([task])

    expect(searchTasks(index, 'r')).toEqual([])
    expect(searchTasks(index, '')).toEqual([])
  })

  it('matches checklist items and returns field "checklist" with a snippet containing the term', () => {
    const task = makeTask({
      title: 'Prepare launch',
      checklist: [makeChecklistItem({ taskId: crypto.randomUUID(), title: 'Order stanchions for the booth' })],
    })
    const index = buildIndex([task])

    const hits = searchTasks(index, 'stanchions')

    expect(hits.length).toBeGreaterThan(0)
    const hit = hits[0]!
    expect(hit.taskId).toBe(task.id)
    expect(hit.field).toBe('checklist')
    expect(hit.snippet).not.toBeNull()
    expect(hit.snippet!.toLowerCase()).toContain('stanchions')
  })

  it('matches tag names and returns field "tags"', () => {
    const tag: Tag = { id: crypto.randomUUID(), name: 'urgent-fix', color: 'red', createdAt: daysAgo(5) }
    const task = makeTask({ title: 'Something unrelated', tagIds: [tag.id] })
    const index = buildIndex([task], { tags: [tag] })

    const hits = searchTasks(index, 'urgent-fix')

    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.taskId).toBe(task.id)
    expect(hits[0]!.field).toBe('tags')
  })

  it('titleRanges point at the matched substring', () => {
    const task = makeTask({ title: 'Deadline review' })
    const index = buildIndex([task])

    const hits = searchTasks(index, 'Deadline')

    expect(hits.length).toBeGreaterThan(0)
    const hit = hits[0]!
    expect(hit.field).toBe('title')
    expect(hit.titleRanges.length).toBeGreaterThan(0)
    const [start, end] = hit.titleRanges[0]!
    expect(task.title.slice(start, end + 1).toLowerCase()).toBe('deadline')
  })
})
