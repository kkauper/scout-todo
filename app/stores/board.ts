import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { BoardColumn, BoardData, ChecklistItem, ColorKey, ColumnKind, Project, StateEvent, Tag, Task, TaskLink, TaskLinkType, TaskSize } from '#shared/types/domain'
import { COLOR_KEYS } from '#shared/types/domain'
import { transitionPatch } from '#shared/utils/transitions'
import { positionAtIndex, positionBetween } from '#shared/utils/position'
import { adjacentColumnId, withinColumnTargetIndex } from '#shared/utils/reorder'

export const useBoardStore = defineStore('board', () => {
  const requestFetch = useRequestFetch()

  const projects = ref<Project[]>([])
  const tags = ref<Tag[]>([])
  const tasks = ref<Task[]>([])
  const columns = ref<BoardColumn[]>([])
  const links = ref<TaskLink[]>([])
  const projectFilter = ref<string | null | 'none'>(null)
  const loaded = ref(false)
  const revision = ref(0)
  const lastError = ref<string | null>(null)

  const projectById = computed<Map<string, Project>>(() => new Map(projects.value.map((p) => [p.id, p])))
  const tagById = computed<Map<string, Tag>>(() => new Map(tags.value.map((t) => [t.id, t])))
  const columnById = computed<Map<string, BoardColumn>>(() => new Map(columns.value.map((c) => [c.id, c])))

  const sortedColumns = computed<BoardColumn[]>(() => [...columns.value].sort((a, b) => a.position - b.position))
  const visibleColumns = computed<BoardColumn[]>(() => sortedColumns.value.filter((c) => !c.hidden))
  const hiddenColumns = computed<BoardColumn[]>(() => sortedColumns.value.filter((c) => c.hidden))

  const visibleTasks = computed<Task[]>(() => {
    const filter = projectFilter.value
    if (filter === null) return tasks.value
    if (filter === 'none') return tasks.value.filter((t) => t.projectId === null)
    return tasks.value.filter((t) => t.projectId === filter)
  })

  function tasksByColumn(columnId: string): Task[] {
    return visibleTasks.value
      .filter((t) => t.columnId === columnId)
      .sort((a, b) => a.position - b.position)
  }

  async function load() {
    try {
      const data = await requestFetch<BoardData>('/api/board')
      projects.value = data.projects
      tags.value = data.tags
      tasks.value = data.tasks
      columns.value = data.columns
      links.value = data.links
      loaded.value = true
    }
    catch (e) {
      if (import.meta.client && isUnauthorized(e)) {
        const { clear } = useUserSession()
        await clear()
        reloadNuxtApp({ path: '/login' })
        return
      }
      throw e
    }
  }

  function extractErrorMessage(e: unknown): string {
    const err = e as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    return err?.data?.statusMessage ?? err?.statusMessage ?? err?.message ?? 'Request failed'
  }

  function isUnauthorized(e: unknown): boolean {
    const err = e as { statusCode?: number; status?: number } | undefined
    return err?.statusCode === 401 || err?.status === 401
  }

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await fn()
      revision.value++
      return result
    }
    catch (e) {
      if (isUnauthorized(e)) {
        const { clear } = useUserSession()
        await clear()
        reloadNuxtApp({ path: '/login' })
        return undefined
      }
      lastError.value = extractErrorMessage(e)
      await load()
      return undefined
    }
  }

  function upsertTask(t: Task) {
    const index = tasks.value.findIndex((existing) => existing.id === t.id)
    if (index === -1) tasks.value.push(t)
    else tasks.value.splice(index, 1, t)
  }

  async function moveTask(id: string, toColumnId: string, toIndex: number) {
    const task = tasks.value.find((t) => t.id === id)
    const toColumn = columnById.value.get(toColumnId)
    if (!task || !toColumn) return

    const fromKind: ColumnKind = columnById.value.get(task.columnId)?.kind ?? 'open'
    const list = tasksByColumn(toColumnId).filter((t) => t.id !== id)
    const position = positionAtIndex(list.map((t) => t.position), toIndex)
    const now = new Date()
    const patch = transitionPatch(task, fromKind, toColumn, now)

    task.position = position
    if (patch) {
      task.columnId = patch.columnId
      task.stateChangedAt = patch.stateChangedAt
      task.completedAt = patch.completedAt
    }
    task.updatedAt = now.toISOString()

    const result = await run(() => $fetch<Task>(`/api/tasks/${id}/move`, {
      method: 'POST',
      body: { columnId: toColumnId, position },
    }))
    if (result) upsertTask(result)
  }

  async function moveTaskWithinColumn(id: string, delta: -1 | 1): Promise<boolean> {
    const task = tasks.value.find((t) => t.id === id)
    if (!task) return false
    const orderedIds = tasksByColumn(task.columnId).map((t) => t.id)
    const targetIndex = withinColumnTargetIndex(orderedIds, id, delta)
    if (targetIndex === null) return false
    await moveTask(id, task.columnId, targetIndex)
    return true
  }

  async function moveTaskToAdjacentColumn(id: string, direction: -1 | 1): Promise<boolean> {
    const task = tasks.value.find((t) => t.id === id)
    if (!task) return false
    const ids = visibleColumns.value.map((c) => c.id)
    const targetColumnId = adjacentColumnId(ids, task.columnId, direction)
    if (!targetColumnId) return false
    const sourceList = tasksByColumn(task.columnId)
    const currentIndex = sourceList.findIndex((t) => t.id === id)
    const targetList = tasksByColumn(targetColumnId)
    const targetIndex = Math.min(currentIndex === -1 ? 0 : currentIndex, targetList.length)
    await moveTask(id, targetColumnId, targetIndex)
    return true
  }

  async function createTask(input: { title: string; columnId?: string; projectId?: string | null; description?: string | null; deadline?: string | null; size?: TaskSize | null; tagIds?: string[] }): Promise<Task | undefined> {
    const projectId = input.projectId !== undefined
      ? input.projectId
      : (projectFilter.value && projectFilter.value !== 'none' ? projectFilter.value : null)

    const result = await run(() => $fetch<Task>('/api/tasks', {
      method: 'POST',
      body: {
        title: input.title,
        columnId: input.columnId,
        projectId,
        description: input.description ?? null,
        deadline: input.deadline ?? null,
        size: input.size ?? null,
        tagIds: input.tagIds ?? [],
      },
    }))
    if (result) upsertTask(result)
    return result
  }

  async function updateTask(id: string, patch: { title?: string; description?: string | null; projectId?: string | null; deadline?: string | null; size?: TaskSize | null; tagIds?: string[] }) {
    const task = tasks.value.find((t) => t.id === id)
    if (task) {
      if (patch.title !== undefined) task.title = patch.title
      if (patch.description !== undefined) task.description = patch.description
      if (patch.projectId !== undefined) task.projectId = patch.projectId
      if (patch.deadline !== undefined) task.deadline = patch.deadline
      if (patch.size !== undefined) task.size = patch.size
      if (patch.tagIds !== undefined) task.tagIds = patch.tagIds
      task.updatedAt = new Date().toISOString()
    }

    const result = await run(() => $fetch<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: patch,
    }))
    if (result) upsertTask(result)
  }

  async function deleteTask(id: string) {
    tasks.value = tasks.value.filter((t) => t.id !== id)
    links.value = links.value.filter((l) => l.fromTaskId !== id && l.toTaskId !== id)
    await run(() => $fetch(`/api/tasks/${id}`, { method: 'DELETE' }))
  }

  async function addLink(taskId: string, toTaskId: string, type: TaskLinkType) {
    const result = await run(() => $fetch<TaskLink>(`/api/tasks/${taskId}/links`, {
      method: 'POST',
      body: { toTaskId, type },
    }))
    if (result) links.value.push(result)
    return result
  }

  async function removeLink(id: string) {
    links.value = links.value.filter((l) => l.id !== id)
    await run(() => $fetch(`/api/links/${id}`, { method: 'DELETE' }))
  }

  async function convertChecklistItem(taskId: string, itemId: string): Promise<Task | undefined> {
    const result = await run(() => $fetch<{ task: Task; link: TaskLink; item: ChecklistItem }>(`/api/checklist/${itemId}/convert`, {
      method: 'POST',
    }))
    if (!result) return undefined

    upsertTask(result.task)
    links.value.push(result.link)

    const task = tasks.value.find((t) => t.id === taskId)
    if (task) {
      const index = task.checklist.findIndex((i) => i.id === itemId)
      if (index === -1) task.checklist.push(result.item)
      else task.checklist.splice(index, 1, result.item)
    }

    return result.task
  }

  async function addChecklistItems(taskId: string, titles: string[]) {
    const result = await run(() => $fetch<ChecklistItem[]>(`/api/tasks/${taskId}/checklist`, {
      method: 'POST',
      body: { titles },
    }))
    if (result) {
      const task = tasks.value.find((t) => t.id === taskId)
      if (task) task.checklist = [...task.checklist, ...result]
    }
  }

  async function updateChecklistItem(taskId: string, itemId: string, patch: { title?: string; done?: boolean; position?: number }) {
    const task = tasks.value.find((t) => t.id === taskId)
    const item = task?.checklist.find((i) => i.id === itemId)
    if (item) {
      if (patch.title !== undefined) item.title = patch.title
      if (patch.done !== undefined) {
        item.done = patch.done
        item.completedAt = patch.done ? new Date().toISOString() : null
      }
      if (patch.position !== undefined) item.position = patch.position
    }

    const result = await run(() => $fetch<ChecklistItem>(`/api/checklist/${itemId}`, {
      method: 'PATCH',
      body: patch,
    }))
    if (result && task) {
      const index = task.checklist.findIndex((i) => i.id === itemId)
      if (index === -1) task.checklist.push(result)
      else task.checklist.splice(index, 1, result)
    }
  }

  async function deleteChecklistItem(taskId: string, itemId: string) {
    const task = tasks.value.find((t) => t.id === taskId)
    if (task) task.checklist = task.checklist.filter((i) => i.id !== itemId)
    await run(() => $fetch(`/api/checklist/${itemId}`, { method: 'DELETE' }))
  }

  async function createProject(name: string, color?: ColorKey): Promise<Project> {
    const resolvedColor = color ?? COLOR_KEYS[projects.value.length % COLOR_KEYS.length]!
    const project = await $fetch<Project>('/api/projects', {
      method: 'POST',
      body: { name, color: resolvedColor },
    })
    projects.value.push(project)
    revision.value++
    return project
  }

  async function createTag(name: string, color?: ColorKey): Promise<Tag> {
    const resolvedColor = color ?? COLOR_KEYS[(tags.value.length + 3) % COLOR_KEYS.length]!
    const tag = await $fetch<Tag>('/api/tags', {
      method: 'POST',
      body: { name, color: resolvedColor },
    })
    tags.value.push(tag)
    revision.value++
    return tag
  }

  async function fetchEvents(id: string): Promise<StateEvent[]> {
    return await $fetch<StateEvent[]>(`/api/tasks/${id}/events`)
  }

  async function createColumn(name: string, kind: ColumnKind): Promise<BoardColumn | undefined> {
    const result = await run(() => $fetch<BoardColumn>('/api/columns', {
      method: 'POST',
      body: { name, kind },
    }))
    if (result) columns.value.push(result)
    return result
  }

  async function updateColumn(id: string, patch: { name?: string; kind?: ColumnKind; hidden?: boolean; position?: number }) {
    const column = columns.value.find((c) => c.id === id)
    const kindChanged = patch.kind !== undefined && column !== undefined && patch.kind !== column.kind
    if (column) {
      if (patch.name !== undefined) column.name = patch.name
      if (patch.kind !== undefined) column.kind = patch.kind
      if (patch.hidden !== undefined) column.hidden = patch.hidden
      if (patch.position !== undefined) column.position = patch.position
      column.updatedAt = new Date().toISOString()
    }

    const result = await run(() => $fetch<BoardColumn>(`/api/columns/${id}`, {
      method: 'PATCH',
      body: patch,
    }))
    if (result) {
      const index = columns.value.findIndex((c) => c.id === id)
      if (index === -1) columns.value.push(result)
      else columns.value.splice(index, 1, result)
      if (kindChanged) await load()
    }
  }

  async function deleteColumn(id: string, moveTo?: string) {
    await run(() => $fetch(`/api/columns/${id}`, {
      method: 'DELETE',
      query: moveTo ? { moveTo } : undefined,
    }))
    await load()
  }

  async function moveColumn(id: string, direction: -1 | 1) {
    const list = sortedColumns.value
    const index = list.findIndex((c) => c.id === id)
    if (index === -1) return
    const neighbourIndex = index + direction
    const neighbour = list[neighbourIndex]
    if (!neighbour) return

    let newPosition: number
    if (direction === -1) {
      const before = list[neighbourIndex - 1] ?? null
      newPosition = positionBetween(before?.position ?? null, neighbour.position)
    }
    else {
      const after = list[neighbourIndex + 1] ?? null
      newPosition = positionBetween(neighbour.position, after?.position ?? null)
    }

    await updateColumn(id, { position: newPosition })
  }

  return {
    projects,
    tags,
    tasks,
    columns,
    links,
    projectFilter,
    loaded,
    revision,
    lastError,
    projectById,
    tagById,
    columnById,
    sortedColumns,
    visibleColumns,
    hiddenColumns,
    visibleTasks,
    tasksByColumn,
    load,
    moveTask,
    moveTaskWithinColumn,
    moveTaskToAdjacentColumn,
    createTask,
    updateTask,
    deleteTask,
    addLink,
    removeLink,
    convertChecklistItem,
    addChecklistItems,
    updateChecklistItem,
    deleteChecklistItem,
    createProject,
    createTag,
    fetchEvents,
    createColumn,
    updateColumn,
    deleteColumn,
    moveColumn,
  }
})
