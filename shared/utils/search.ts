import Fuse from 'fuse.js'
import type { IFuseOptions } from 'fuse.js'
import type { BoardColumn, Project, Tag, Task } from '../types/domain'

export interface SearchDoc {
  id: string
  title: string
  description: string
  checklist: string[]
  project: string
  tags: string[]
  done: boolean // task sits in a column of kind 'done'
}

export type SearchField = 'title' | 'description' | 'checklist' | 'project' | 'tags'

export interface SearchHit {
  taskId: string
  score: number // lower = better, after done-penalty
  field: SearchField // best-matching field
  snippet: string | null // null when field === 'title'; else ≤ 90 chars around the match with '…' where cut
  titleRanges: [number, number][] // inclusive index ranges into title for highlighting (may be empty)
}

const DONE_PENALTY = 0.25
const SNIPPET_MAX_LENGTH = 90

// Priority order used to pick the best-matching field when a doc matches on multiple fields.
const FIELD_PRIORITY: SearchField[] = ['title', 'tags', 'project', 'checklist', 'description']

const FUSE_OPTIONS: IFuseOptions<SearchDoc> = {
  keys: [
    { name: 'title', weight: 3 },
    { name: 'tags', weight: 2 },
    { name: 'project', weight: 2 },
    { name: 'checklist', weight: 1.5 },
    { name: 'description', weight: 1 },
  ],
  includeScore: true,
  includeMatches: true,
  ignoreLocation: true,
  threshold: 0.35,
  minMatchCharLength: 2,
}

export function toSearchDocs(tasks: Task[], projects: Map<string, Project>, tags: Map<string, Tag>, columns: Map<string, BoardColumn>): SearchDoc[] {
  return tasks.map((task) => {
    const column = columns.get(task.columnId)
    const project = task.projectId ? projects.get(task.projectId) : undefined
    return {
      id: task.id,
      title: task.title,
      description: task.description ?? '',
      checklist: task.checklist.map((item) => item.title),
      project: project?.name ?? '',
      tags: task.tagIds
        .map((tagId) => tags.get(tagId)?.name)
        .filter((name): name is string => !!name),
      done: column?.kind === 'done',
    }
  })
}

export function createSearchIndex(docs: SearchDoc[]): Fuse<SearchDoc> {
  return new Fuse(docs, FUSE_OPTIONS)
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = [[sorted[0]![0], sorted[0]![1]]]
  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i]!
    const last = merged[merged.length - 1]!
    if (start <= last[1] + 1) {
      last[1] = Math.max(last[1], end)
    }
    else {
      merged.push([start, end])
    }
  }
  return merged
}

function buildSnippet(value: string, start: number, end: number): string {
  if (value.length <= SNIPPET_MAX_LENGTH) return value

  const matchLength = end - start + 1
  const context = Math.max(0, Math.floor((SNIPPET_MAX_LENGTH - matchLength) / 2))
  let from = Math.max(0, start - context)
  let to = Math.min(value.length, end + 1 + context)

  if (from === 0) to = Math.min(value.length, SNIPPET_MAX_LENGTH)
  if (to === value.length) from = Math.max(0, value.length - SNIPPET_MAX_LENGTH)

  let snippet = value.slice(from, to)
  if (from > 0) snippet = `…${snippet}`
  if (to < value.length) snippet = `${snippet}…`
  return snippet
}

export function searchTasks(index: Fuse<SearchDoc>, query: string, limit = 20): SearchHit[] {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const results = index.search(trimmed)

  const hits = results.map((result, originalIndex) => {
    const matches = result.matches ?? []

    let bestField: SearchField = 'description'
    let bestPriority = FIELD_PRIORITY.length
    for (const match of matches) {
      const key = match.key as SearchField | undefined
      if (!key) continue
      const priority = FIELD_PRIORITY.indexOf(key)
      if (priority !== -1 && priority < bestPriority) {
        bestPriority = priority
        bestField = key
      }
    }

    const doc = result.item
    const score = (result.score ?? 0) + (doc.done ? DONE_PENALTY : 0)

    let titleRanges: [number, number][] = []
    let snippet: string | null = null

    if (bestField === 'title') {
      const titleMatch = matches.find((match) => match.key === 'title')
      if (titleMatch) {
        titleRanges = mergeRanges(titleMatch.indices.map(([start, end]) => [start, end] as [number, number]))
      }
    }
    else {
      const fieldMatch = matches.find((match) => match.key === bestField)
      if (fieldMatch) {
        const value = fieldMatch.value ?? ''
        const range = fieldMatch.indices[0]
        if (range) snippet = buildSnippet(value, range[0], range[1])
      }
    }

    return { taskId: doc.id, score, field: bestField, snippet, titleRanges, originalIndex }
  })

  hits.sort((a, b) => a.score - b.score || a.originalIndex - b.originalIndex)

  return hits.slice(0, limit).map(({ taskId, score, field, snippet, titleRanges }) => ({ taskId, score, field, snippet, titleRanges }))
}
