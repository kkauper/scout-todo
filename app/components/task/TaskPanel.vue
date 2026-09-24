<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useIntervalFn, useMediaQuery, useNow } from '@vueuse/core'
import { Circle, CircleCheck, CircleDot, X } from '@lucide/vue'
import { COLUMN_KIND_LABELS } from '#shared/types/domain'
import type { StateEvent, TaskSize } from '#shared/types/domain'
import { useBoardStore } from '../../stores/board'
import { useTaskPanel } from '../../composables/useTaskPanel'
import { useLiveAnnouncer } from '../../composables/useLiveAnnouncer'
import AiTitleSuggestions from '../ai/AiTitleSuggestions.vue'
import AiDescriptionButton from '../ai/AiDescriptionButton.vue'
import AiSubtaskSuggestions from '../ai/AiSubtaskSuggestions.vue'

const store = useBoardStore()
const { taskId, closeTask } = useTaskPanel()
const { announce } = useLiveAnnouncer()

const isMobile = useMediaQuery('(max-width: 767.98px)')

const task = computed(() => (taskId.value ? store.tasks.find((t) => t.id === taskId.value) ?? null : null))

// Task was deleted while the panel was open for it.
watch(task, (t) => {
  if (taskId.value && !t) {
    announce('This task was deleted.')
    closeTask()
  }
})

const projectName = computed(() => (task.value?.projectId ? store.projectById.get(task.value.projectId)?.name ?? null : null))
const tagNames = computed(() => (task.value?.tagIds ?? []).map((id) => store.tagById.get(id)?.name).filter((n): n is string => !!n))

const panelTitle = computed(() => {
  if (!task.value) return 'Task'
  const columnName = store.columnById.get(task.value.columnId)?.name ?? 'Task'
  return `${columnName} · Task`
})

// --- Autosave ---------------------------------------------------------

const pending = ref(0)
const savedAt = ref<number | null>(null)
const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 500) })

const statusText = computed(() => {
  if (pending.value > 0) return 'Saving…'
  if (savedAt.value !== null && now.value.getTime() - savedAt.value < 2000) return 'Saved'
  return ''
})

async function saveTask(id: string, patch: Parameters<typeof store.updateTask>[1]) {
  pending.value++
  try {
    await store.updateTask(id, patch)
  }
  finally {
    pending.value--
    if (pending.value === 0) savedAt.value = Date.now()
  }
}

function save(patch: Parameters<typeof store.updateTask>[1]) {
  if (!task.value) return
  return saveTask(task.value.id, patch)
}

const projectId = computed<string | null>({
  get: () => task.value?.projectId ?? null,
  set: (value) => { save({ projectId: value }) },
})
const deadline = computed<string | null>({
  get: () => task.value?.deadline ?? null,
  set: (value) => { save({ deadline: value }) },
})
const size = computed<TaskSize | null>({
  get: () => task.value?.size ?? null,
  set: (v) => { save({ size: v }) },
})
const tagIds = computed<string[]>({
  get: () => task.value?.tagIds ?? [],
  set: (value) => { save({ tagIds: value }) },
})

const KIND_ICON = { open: Circle, active: CircleDot, done: CircleCheck } as const

const columnOptions = computed(() => {
  const cols = [...store.visibleColumns]
  const currentColumnId = task.value?.columnId
  if (currentColumnId && !cols.some((c) => c.id === currentColumnId)) {
    const current = store.columnById.get(currentColumnId)
    if (current) cols.push(current)
  }
  return cols
})

const columnId = computed<string>({
  get: () => task.value?.columnId ?? '',
  set: (value) => {
    if (!task.value || value === task.value.columnId) return
    const toIndex = store.tasksByColumn(value).filter((t) => t.id !== task.value!.id).length
    store.moveTask(task.value.id, value, toIndex)
    announce(`Moved to ${store.columnById.get(value)?.name ?? ''}.`)
  },
})
const currentColumnName = computed(() => store.columnById.get(columnId.value)?.name ?? '')

// --- Title / description drafts ---------------------------------------

const titleDraft = ref('')
const descriptionDraft = ref('')
const titleFocused = ref(false)
const descriptionFocused = ref(false)

function loadDraftsFromTask() {
  titleDraft.value = task.value?.title ?? ''
  descriptionDraft.value = task.value?.description ?? ''
}

loadDraftsFromTask()

function commitTitle() {
  if (!task.value) return
  const trimmed = titleDraft.value.trim()
  if (!trimmed) {
    titleDraft.value = task.value.title
    return
  }
  if (trimmed !== task.value.title) save({ title: trimmed })
}

function onTitleFocus() {
  titleFocused.value = true
}

function onTitleBlur() {
  titleFocused.value = false
  commitTitle()
}

function onTitlePick(t: string) {
  titleDraft.value = t
  commitTitle()
}

function commitDescription() {
  if (!task.value) return
  const value = descriptionDraft.value === '' ? null : descriptionDraft.value
  if (value !== task.value.description) save({ description: value })
}

function onDescriptionFocus() {
  descriptionFocused.value = true
}

function onDescriptionBlur() {
  descriptionFocused.value = false
  commitDescription()
}

function onDescriptionResult(d: string) {
  descriptionDraft.value = d
  commitDescription()
}

// Re-sync drafts from the store when the SAME task's stored value changes
// elsewhere (e.g. inline card edit) while the field is not focused. Guarded
// by comparing task ids so a task switch (handled below) never races this.
watch([taskId, () => task.value?.title], ([newId, newTitle], [oldId]) => {
  if (newId !== oldId) return
  if (!titleFocused.value && newTitle !== undefined) titleDraft.value = newTitle
})
watch([taskId, () => task.value?.description], ([newId, newDescription], [oldId]) => {
  if (newId !== oldId) return
  if (!descriptionFocused.value) descriptionDraft.value = newDescription ?? ''
})

async function onAddSuggested(titles: string[]) {
  if (!titles.length || !task.value) return
  await store.addChecklistItems(task.value.id, titles)
}

const subtaskAi = ref<InstanceType<typeof AiSubtaskSuggestions> | null>(null)

// --- Activity / events --------------------------------------------------

const events = ref<StateEvent[]>([])

async function loadEvents(id: string) {
  events.value = await store.fetchEvents(id)
}

function fromLabel(e: StateEvent): string {
  return e.fromColumnId ? (store.columnById.get(e.fromColumnId)?.name ?? 'created') : 'created'
}

function toLabel(e: StateEvent): string {
  if (e.toColumnId) return store.columnById.get(e.toColumnId)?.name ?? 'deleted column'
  return `deleted column (${COLUMN_KIND_LABELS[e.toKind]})`
}

// --- Flush on switch / close, load new task, fetch events, focus --------

async function flushDrafts(id: string) {
  const t = store.tasks.find((x) => x.id === id)
  if (!t) return
  const title = titleDraft.value.trim()
  if (title && title !== t.title) await saveTask(id, { title })
  const description = descriptionDraft.value === '' ? null : descriptionDraft.value
  if (description !== t.description) await saveTask(id, { description })
}

watch(
  [taskId, () => task.value?.columnId],
  async ([newId, columnId], [oldId, oldColumnId]) => {
    if (oldId && oldId !== newId) {
      await flushDrafts(oldId)
    }
    if (newId !== oldId) {
      loadDraftsFromTask()
      if (newId) {
        await loadEvents(newId)
        await nextTick()
        document.getElementById('task-panel-title')?.focus({ preventScroll: true })
        revealCard(newId)
      }
      else {
        events.value = []
      }
    }
    else if (newId && columnId !== oldColumnId) {
      await loadEvents(newId)
    }
  },
)

onMounted(async () => {
  const id = taskId.value
  if (!id) return
  await loadEvents(id)
  await nextTick()
  document.getElementById('task-panel-title')?.focus({ preventScroll: true })
  revealCard(id)
})

onBeforeUnmount(() => {
  if (taskId.value) flushDrafts(taskId.value)
})

// --- Close / Escape -------------------------------------------------

async function closePanel() {
  const id = task.value?.id
  closeTask()
  await nextTick()
  if (id) {
    document.querySelector<HTMLElement>(`[data-task-id="${id}"] [data-card-open]`)?.focus()
  }
}

function onEscape(e: KeyboardEvent) {
  if (e.defaultPrevented) return
  closePanel()
}

function revealCard(id: string) {
  if (!window.matchMedia('(min-width: 768px)').matches) return
  const card = document.querySelector<HTMLElement>(`li[data-task-id="${id}"]`)
  const panel = document.querySelector<HTMLElement>('aside[aria-labelledby="task-panel-title"]')
  const scroller = document.querySelector<HTMLElement>('[data-board-scroller]')
  if (!card || !panel || !scroller) return
  const overlap = card.getBoundingClientRect().right - panel.getBoundingClientRect().left
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  if (overlap > 0) scroller.scrollBy({ left: overlap + 16, behavior })
}
</script>

<template>
  <aside
    v-if="task"
    :role="isMobile ? 'dialog' : 'complementary'"
    :aria-modal="isMobile ? 'true' : undefined"
    aria-labelledby="task-panel-title"
    class="flex flex-col bg-background max-md:fixed max-md:inset-0 max-md:z-50 md:absolute md:inset-y-0 md:right-0 md:z-30 md:w-[28rem] md:border-l md:shadow-xl lg:w-[32rem] motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-150"
    @keydown.esc="onEscape"
  >
    <div class="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <h2 id="task-panel-title" tabindex="-1" class="truncate text-sm font-medium outline-none">
        {{ panelTitle }}
      </h2>
      <span aria-live="polite" class="text-xs text-muted-foreground">{{ statusText }}</span>
      <div class="flex-1" />
      <Button variant="ghost" size="icon" aria-label="Close task" @click="closePanel">
        <X />
      </Button>
    </div>
    <div class="flex-1 overflow-y-auto min-h-0 space-y-6 px-4 py-4">
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <Label for="task-title">Title</Label>
          <AiTitleSuggestions :title="titleDraft" :description="descriptionDraft" :project-name="projectName" @pick="onTitlePick" />
        </div>
        <Input
          id="task-title"
          v-model="titleDraft"
          maxlength="200"
          @focus="onTitleFocus"
          @blur="onTitleBlur"
          @keydown.enter="commitTitle"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Select v-model="columnId">
          <SelectTrigger size="sm" class="w-auto" :aria-label="`Column: ${currentColumnName}`">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="c in columnOptions" :key="c.id" :value="c.id">
              <component :is="KIND_ICON[c.kind]" role="img" class="size-3.5 shrink-0 text-muted-foreground" :aria-label="COLUMN_KIND_LABELS[c.kind]" />
              {{ c.name }}
            </SelectItem>
          </SelectContent>
        </Select>
        <ProjectPicker v-model="projectId" />
        <DeadlinePicker v-model="deadline" />
        <SizePicker v-model="size" />
      </div>
      <p v-if="size === 'xl'" class="text-xs text-muted-foreground">
        XL tasks are hard to estimate — consider splitting into checklist items or separate tasks.
      </p>

      <TagPicker v-model="tagIds" />

      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <Label for="task-description">Description</Label>
          <AiDescriptionButton :title="titleDraft" :project-name="projectName" :tags="tagNames" :existing="descriptionDraft" @result="onDescriptionResult" />
        </div>
        <Textarea
          id="task-description"
          v-model="descriptionDraft"
          rows="6"
          @focus="onDescriptionFocus"
          @blur="onDescriptionBlur"
        />
      </div>

      <div class="space-y-2">
        <ChecklistEditor :task-id="task.id">
          <template #actions>
            <AiButton label="Suggest sub-todos" :loading="subtaskAi?.loading ?? false" @click="subtaskAi?.run()" />
          </template>
        </ChecklistEditor>
        <AiSubtaskSuggestions ref="subtaskAi" :title="titleDraft" :description="descriptionDraft" @add="onAddSuggested" />
      </div>

      <TaskTime :task-id="task.id" />

      <TaskLinks :task-id="task.id" />

      <div class="space-y-2">
        <h3 class="text-sm font-medium">
          Activity
        </h3>
        <dl class="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <dt>Created</dt>
          <dd>{{ new Date(task.createdAt).toLocaleString() }}</dd>
          <dt>Last state change</dt>
          <dd>{{ new Date(task.stateChangedAt).toLocaleString() }}</dd>
          <template v-if="task.completedAt">
            <dt>Completed</dt>
            <dd>{{ new Date(task.completedAt).toLocaleString() }}</dd>
          </template>
        </dl>
        <ul class="space-y-1 text-xs text-muted-foreground">
          <li v-for="(e, i) in events" :key="i">
            {{ fromLabel(e) }} → {{ toLabel(e) }} · {{ new Date(e.changedAt).toLocaleString() }}
          </li>
        </ul>
      </div>
    </div>
  </aside>
</template>
