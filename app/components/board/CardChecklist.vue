<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ListChecks } from '@lucide/vue'
import type { Task } from '#shared/types/domain'
import { useBoardStore } from '../../stores/board'

const props = defineProps<{ task: Task }>()

const store = useBoardStore()
const openState = useState<Record<string, boolean>>('checklistOpen', () => ({}))
const open = computed<boolean>({
  get: () => openState.value[props.task.id] ?? false,
  set: (value) => { openState.value[props.task.id] = value },
})

const newTitle = ref('')

const sortedItems = computed(() => [...props.task.checklist].sort((a, b) => a.position - b.position))
const doneCount = computed(() => sortedItems.value.filter((i) => i.done).length)
const totalCount = computed(() => sortedItems.value.length)
const progress = computed(() => (totalCount.value > 0 ? (doneCount.value / totalCount.value) * 100 : 0))

function toggleDone(itemId: string, value: boolean | 'indeterminate') {
  store.updateChecklistItem(props.task.id, itemId, { done: value === true })
}

async function addItem() {
  const title = newTitle.value.trim()
  if (!title) return
  newTitle.value = ''
  await store.addChecklistItems(props.task.id, [title])
}
</script>

<template>
  <div
    v-if="task.checklist.length > 0"
    data-no-open
    class="space-y-1"
    @click.stop
    @dblclick.stop
    @keydown.enter.stop
  >
    <button
      type="button"
      data-no-drag
      :aria-expanded="open"
      :aria-controls="`checklist-${task.id}`"
      :aria-label="`Sub-todos ${doneCount} of ${totalCount}, ${open ? 'collapse' : 'expand'}`"
      class="flex w-full items-center gap-2 text-xs text-muted-foreground"
      @click="open = !open"
    >
      <ListChecks class="size-3.5 shrink-0" />
      <span class="shrink-0">{{ doneCount }}/{{ totalCount }}</span>
      <Progress :model-value="progress" class="h-1 flex-1" />
      <ChevronDown class="size-3.5 shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" />
    </button>
    <ul v-if="open" :id="`checklist-${task.id}`" data-no-drag role="list" class="space-y-1 pl-1">
      <li v-for="item in sortedItems" :key="item.id" class="flex items-center gap-2">
        <Checkbox
          :model-value="item.done"
          :aria-label="`Done: ${item.title}`"
          @update:model-value="(v) => toggleDone(item.id, v)"
        />
        <span class="truncate text-xs" :class="item.done ? 'line-through text-muted-foreground' : ''">
          {{ item.title }}
        </span>
      </li>
      <li class="flex items-center gap-2">
        <Input
          v-model="newTitle"
          data-no-drag
          class="h-7 text-xs"
          placeholder="Add sub-todo…"
          @keydown.enter.prevent="addItem"
        />
      </li>
    </ul>
  </div>
</template>
