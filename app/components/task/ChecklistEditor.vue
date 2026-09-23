<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { X } from '@lucide/vue'
import { useBoardStore } from '../../stores/board'

const props = defineProps<{ taskId: string | null }>()
const draft = defineModel<string[]>('draft', { default: () => [] })

const store = useBoardStore()

const newTitle = ref('')
const drafts = reactive<Record<string, string>>({})

interface Row { key: string; title: string; done: boolean; itemId: string | null; draftIndex: number | null }

const task = computed(() => (props.taskId ? store.tasks.find((t) => t.id === props.taskId) ?? null : null))

const rows = computed<Row[]>(() => {
  if (props.taskId) {
    return [...(task.value?.checklist ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((item): Row => ({ key: item.id, title: item.title, done: item.done, itemId: item.id, draftIndex: null }))
  }
  return draft.value.map((title, i): Row => ({ key: `draft-${i}`, title, done: false, itemId: null, draftIndex: i }))
})

const doneCount = computed(() => rows.value.filter((r) => r.done).length)
const totalCount = computed(() => rows.value.length)

function rowValue(row: Row): string {
  return drafts[row.key] ?? row.title
}

function onInput(row: Row, value: string | number) {
  drafts[row.key] = String(value)
}

function toggleDone(row: Row, value: boolean | 'indeterminate') {
  if (!props.taskId || !row.itemId) return
  store.updateChecklistItem(props.taskId, row.itemId, { done: value === true })
}

function commitEdit(row: Row) {
  const raw = drafts[row.key]
  delete drafts[row.key]
  if (raw === undefined) return
  const value = raw.trim()
  if (!value || value === row.title) return

  if (props.taskId && row.itemId) {
    store.updateChecklistItem(props.taskId, row.itemId, { title: value })
  }
  else if (row.draftIndex !== null) {
    const next = [...draft.value]
    next[row.draftIndex] = value
    draft.value = next
  }
}

function removeRow(row: Row) {
  if (props.taskId && row.itemId) {
    store.deleteChecklistItem(props.taskId, row.itemId)
  }
  else if (row.draftIndex !== null) {
    draft.value = draft.value.filter((_, i) => i !== row.draftIndex)
  }
}

function addItem() {
  const title = newTitle.value.trim()
  if (!title) return
  newTitle.value = ''
  if (props.taskId) {
    store.addChecklistItems(props.taskId, [title])
  }
  else {
    draft.value = [...draft.value, title]
  }
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between text-sm font-medium">
      <span>Sub-todos</span>
      <span v-if="totalCount > 0" class="text-xs font-normal text-muted-foreground">{{ doneCount }}/{{ totalCount }}</span>
    </div>
    <ul class="space-y-1" role="list">
      <li v-for="row in rows" :key="row.key" class="flex items-center gap-2">
        <Checkbox
          v-if="props.taskId"
          :model-value="row.done"
          :aria-label="`Done: ${row.title}`"
          @update:model-value="(v) => toggleDone(row, v)"
        />
        <Input
          :model-value="rowValue(row)"
          class="h-7 flex-1 border-transparent px-1 shadow-none focus-visible:border-input"
          @update:model-value="(v) => onInput(row, v)"
          @blur="commitEdit(row)"
          @keydown.enter.prevent="commitEdit(row)"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-6 shrink-0"
          :aria-label="`Remove ${row.title}`"
          @click="removeRow(row)"
        >
          <X class="size-3.5" />
        </Button>
      </li>
    </ul>
    <Input
      v-model="newTitle"
      placeholder="Add sub-todo…"
      class="h-8"
      @keydown.enter.prevent="addItem"
    />
  </div>
</template>
