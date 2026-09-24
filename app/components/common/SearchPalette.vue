<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Circle, CircleCheck, CircleDot, Plus, Search } from '@lucide/vue'
import { ListboxFilter } from 'reka-ui'
import { COLUMN_KIND_LABELS } from '#shared/types/domain'
import { createSearchIndex, searchTasks, toSearchDocs } from '#shared/utils/search'
import type { SearchHit } from '#shared/utils/search'
import { CommandDialog, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import { useBoardStore } from '../../stores/board'
import { useTaskDialog } from '../../composables/useTaskDialog'
import { useTaskPanel } from '../../composables/useTaskPanel'
import { useLiveAnnouncer } from '../../composables/useLiveAnnouncer'

const open = defineModel<boolean>('open', { default: false })

const store = useBoardStore()
const { openTask } = useTaskPanel()
const { openCreate } = useTaskDialog()
const { announce } = useLiveAnnouncer()

const query = ref('')

const KIND_ICON = { open: Circle, active: CircleDot, done: CircleCheck } as const

const index = computed(() => createSearchIndex(toSearchDocs(store.tasks, store.projectById, store.tagById, store.columnById)))

const results = computed<SearchHit[]>(() => {
  if (!open.value || query.value.trim().length < 2) return []
  return searchTasks(index.value, query.value, 20)
})

interface TitleSegment { text: string; highlighted: boolean }
interface ResultRow {
  hit: SearchHit
  title: string
  titleSegments: TitleSegment[]
  columnName: string
  columnKind: 'open' | 'active' | 'done'
  projectName: string | null
  done: boolean
}

function buildTitleSegments(title: string, ranges: [number, number][]): TitleSegment[] {
  if (ranges.length === 0) return [{ text: title, highlighted: false }]
  const segments: TitleSegment[] = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (start > cursor) segments.push({ text: title.slice(cursor, start), highlighted: false })
    segments.push({ text: title.slice(start, end + 1), highlighted: true })
    cursor = end + 1
  }
  if (cursor < title.length) segments.push({ text: title.slice(cursor), highlighted: false })
  return segments
}

const rows = computed<ResultRow[]>(() => {
  const list: ResultRow[] = []
  for (const hit of results.value) {
    const task = store.tasks.find((t) => t.id === hit.taskId)
    if (!task) continue
    const column = store.columnById.get(task.columnId)
    const project = task.projectId ? store.projectById.get(task.projectId) : undefined
    list.push({
      hit,
      title: task.title,
      titleSegments: buildTitleSegments(task.title, hit.titleRanges),
      columnName: column?.name ?? '',
      columnKind: column?.kind ?? 'open',
      projectName: project?.name ?? null,
      done: column?.kind === 'done',
    })
  }
  return list
})

async function selectHit(hit: SearchHit) {
  open.value = false
  if (!store.visibleTasks.some((t) => t.id === hit.taskId)) store.projectFilter = null
  openTask(hit.taskId)
  await nextTick()
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  document.querySelector(`li[data-task-id="${hit.taskId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior })
}

function createFromQuery() {
  const title = query.value.trim()
  open.value = false
  openCreate(null, title)
}

watch(open, (isOpen) => {
  if (!isOpen) query.value = ''
})

const announceResultCount = useDebounceFn(() => {
  if (query.value.trim().length < 2) return
  const n = rows.value.length
  announce(n === 0 ? 'No results' : `${n} results`)
}, 400)

watch(rows, () => {
  if (query.value.trim().length >= 2) announceResultCount()
})
</script>

<template>
  <CommandDialog
    v-model:open="open"
    title="Search tasks"
    description="Search tasks, checklists, projects and tags"
    class="sm:max-w-xl max-md:inset-0 max-md:top-0 max-md:max-w-none max-md:h-dvh max-md:translate-x-0 max-md:rounded-none"
  >
    <div data-slot="command-input-wrapper" class="p-1 pb-0">
      <InputGroup class="bg-input/30 border-input/30 h-8! rounded-lg! shadow-none! *:data-[slot=input-group-addon]:pl-2!">
        <ListboxFilter
          v-model="query"
          auto-focus
          placeholder="Search tasks, checklists, projects, tags…"
          class="w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
        />
        <InputGroupAddon>
          <Search class="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
    <CommandList>
      <div v-if="query.trim().length < 2" class="py-6 text-center text-sm text-muted-foreground">
        Type to search tasks, checklists, projects and tags
      </div>
      <template v-else-if="rows.length === 0">
        <div class="px-2 pt-5 pb-3 text-center text-sm text-muted-foreground">
          No tasks found for &ldquo;{{ query.trim() }}&rdquo;
        </div>
        <CommandGroup>
          <CommandItem value="__create__" @select="createFromQuery">
            <Plus class="size-3.5" aria-hidden="true" />
            Create task &ldquo;{{ query.trim() }}&rdquo;
          </CommandItem>
        </CommandGroup>
      </template>
      <CommandGroup v-else>
        <CommandItem
          v-for="row in rows"
          :key="row.hit.taskId"
          :value="row.hit.taskId"
          class="flex flex-col items-start gap-0.5 py-2 [&>svg:last-child]:hidden"
          @select="() => selectHit(row.hit)"
        >
          <span class="flex w-full items-center gap-2">
            <component
              :is="KIND_ICON[row.columnKind]"
              class="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span class="truncate text-sm" :class="row.done && 'text-muted-foreground'">
              <span class="sr-only">{{ COLUMN_KIND_LABELS[row.columnKind] }}: </span>
              <template v-for="(segment, i) in row.titleSegments" :key="i">
                <mark v-if="segment.highlighted" class="bg-transparent text-foreground font-semibold">{{ segment.text }}</mark>
                <template v-else>{{ segment.text }}</template>
              </template>
            </span>
          </span>
          <span class="w-full truncate pl-5.5 text-xs text-muted-foreground">
            {{ row.columnName }}<template v-if="row.projectName"> · {{ row.projectName }}</template>
          </span>
          <span v-if="row.hit.snippet" class="w-full truncate pl-5.5 text-xs text-muted-foreground">
            {{ row.hit.snippet }}
          </span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
