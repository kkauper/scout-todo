<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Circle, CircleCheck, CircleDot, Plus, X } from '@lucide/vue'
import { COLUMN_KIND_LABELS } from '#shared/types/domain'
import type { TaskLinkType } from '#shared/types/domain'
import { groupLinksForTask } from '#shared/utils/links'
import type { LinkView } from '#shared/utils/links'
import { createSearchIndex, searchTasks, toSearchDocs } from '#shared/utils/search'
import { useBoardStore } from '../../stores/board'
import { useTaskPanel } from '../../composables/useTaskPanel'

const props = defineProps<{ taskId: string }>()

const store = useBoardStore()
const { openTask } = useTaskPanel()
const { announce } = useLiveAnnouncer()

const KIND_ICON = { open: Circle, active: CircleDot, done: CircleCheck } as const

type LinkTypeOption = TaskLinkType | 'blockedBy'

const TYPE_OPTIONS: { value: LinkTypeOption; label: string }[] = [
  { value: 'blocks', label: 'Blocks' },
  { value: 'blockedBy', label: 'Is blocked by' },
  { value: 'relates', label: 'Relates to' },
  { value: 'duplicates', label: 'Duplicates' },
]

interface GroupDef { key: keyof ReturnType<typeof groupLinksForTask>; label: string }
const GROUP_DEFS: GroupDef[] = [
  { key: 'blocks', label: 'Blocks' },
  { key: 'blockedBy', label: 'Blocked by' },
  { key: 'relates', label: 'Relates to' },
  { key: 'duplicates', label: 'Duplicates' },
  { key: 'duplicatedBy', label: 'Duplicated by' },
]

const groups = computed(() => groupLinksForTask(props.taskId, store.links))
const hasAnyLinks = computed(() => Object.values(groups.value).some((g) => g.length > 0))

function otherTask(view: LinkView) {
  return store.tasks.find((t) => t.id === view.otherTaskId) ?? null
}

function isDone(view: LinkView): boolean {
  const task = otherTask(view)
  if (!task) return false
  return store.columnById.get(task.columnId)?.kind === 'done'
}

function kindFor(view: LinkView): 'open' | 'active' | 'done' {
  const task = otherTask(view)
  return task ? (store.columnById.get(task.columnId)?.kind ?? 'open') : 'open'
}

function titleFor(view: LinkView): string {
  return otherTask(view)?.title ?? 'Unknown task'
}

function removeLink(id: string, title: string) {
  store.removeLink(id)
  announce(`Link to "${title}" removed`)
}

// --- Add link popover ---------------------------------------------------

const open = ref(false)
const linkType = ref<LinkTypeOption>('relates')
const query = ref('')
const highlightedIndex = ref(0)
const addLinkButtonRef = ref<{ $el: HTMLElement } | null>(null)
let searchAnnounceTimer: ReturnType<typeof setTimeout> | undefined

const searchIndex = computed(() => createSearchIndex(toSearchDocs(store.tasks, store.projectById, store.tagById, store.columnById)))

interface ResultRow { taskId: string; title: string; kind: 'open' | 'active' | 'done'; done: boolean }

const results = computed<ResultRow[]>(() => {
  if (query.value.trim().length < 2) return []
  const hits = searchTasks(searchIndex.value, query.value, 9).filter((h) => h.taskId !== props.taskId)
  return hits.slice(0, 8).map((hit) => {
    const task = store.tasks.find((t) => t.id === hit.taskId)
    const kind = task ? (store.columnById.get(task.columnId)?.kind ?? 'open') : 'open'
    return { taskId: hit.taskId, title: task?.title ?? 'Unknown task', kind, done: kind === 'done' }
  })
})

watch(results, () => { highlightedIndex.value = 0 })

watch(open, (isOpen) => {
  if (!isOpen) {
    query.value = ''
    linkType.value = 'relates'
    highlightedIndex.value = 0
  }
})

watch(query, (q) => {
  if (searchAnnounceTimer) clearTimeout(searchAnnounceTimer)
  searchAnnounceTimer = setTimeout(() => {
    if (q.trim().length < 2) return
    const n = results.value.length
    announce(n > 0 ? `${n} matching tasks` : 'No matching tasks')
  }, 400)
})

onBeforeUnmount(() => {
  if (searchAnnounceTimer) clearTimeout(searchAnnounceTimer)
})

async function addResult(otherTaskId: string) {
  const title = store.tasks.find((t) => t.id === otherTaskId)?.title ?? 'Unknown task'
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === linkType.value)?.label ?? ''
  if (linkType.value === 'blockedBy') {
    await store.addLink(otherTaskId, props.taskId, 'blocks')
  }
  else {
    await store.addLink(props.taskId, otherTaskId, linkType.value)
  }
  open.value = false
  announce(`Linked: ${typeLabel} "${title}"`)
  await nextTick()
  addLinkButtonRef.value?.$el?.focus()
}

function onSearchEnter() {
  const target = results.value[highlightedIndex.value] ?? results.value[0]
  if (target) addResult(target.taskId)
}
</script>

<template>
  <div class="space-y-2">
    <h3 class="text-sm font-medium">
      Links
    </h3>

    <p v-if="!hasAnyLinks" class="text-xs text-muted-foreground">
      No links yet
    </p>

    <div v-for="def in GROUP_DEFS" :key="def.key">
      <template v-if="groups[def.key].length > 0">
        <p class="text-xs font-medium text-muted-foreground">
          {{ def.label }}
        </p>
        <ul class="space-y-1" role="list">
          <li v-for="view in groups[def.key]" :key="view.link.id" class="flex items-center gap-2">
            <component
              :is="KIND_ICON[kindFor(view)]"
              class="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <button
              type="button"
              class="flex-1 truncate text-left text-sm hover:underline"
              :class="isDone(view) && 'text-muted-foreground line-through'"
              @click="openTask(view.otherTaskId)"
            >
              <span class="sr-only">{{ COLUMN_KIND_LABELS[kindFor(view)] }}: </span>{{ titleFor(view) }}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="size-6 shrink-0"
              :aria-label="`Remove link to ${titleFor(view)}`"
              @click="removeLink(view.link.id, titleFor(view))"
            >
              <X class="size-3.5" />
            </Button>
          </li>
        </ul>
      </template>
    </div>

    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button ref="addLinkButtonRef" type="button" variant="outline" size="sm">
          <Plus class="size-3.5" />
          Add link
        </Button>
      </PopoverTrigger>
      <PopoverContent data-no-drag class="w-72 gap-2" @click.stop @dblclick.stop @keydown.enter.stop>
        <Select v-model="linkType">
          <SelectTrigger size="sm" class="w-full" aria-label="Link type">
            <SelectValue>{{ TYPE_OPTIONS.find((o) => o.value === linkType)?.label }}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          v-model="query"
          placeholder="Search tasks…"
          aria-label="Search tasks to link"
          @keydown.enter.prevent="onSearchEnter"
        />
        <p v-if="query.trim().length >= 2 && results.length === 0" class="px-1 py-1 text-xs text-muted-foreground">
          No matching tasks
        </p>
        <ul v-else-if="results.length > 0" class="space-y-0.5" role="list">
          <li v-for="row in results" :key="row.taskId">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
              :class="row.done && 'text-muted-foreground line-through'"
              @click="addResult(row.taskId)"
            >
              <component :is="KIND_ICON[row.kind]" class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="truncate"><span class="sr-only">{{ COLUMN_KIND_LABELS[row.kind] }}: </span>{{ row.title }}</span>
            </button>
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  </div>
</template>
