<script setup lang="ts">
import { computed, ref } from 'vue'
import { Maximize2 } from '@lucide/vue'
import { useBoardStore } from '../../stores/board'
import { useTaskDialog } from '../../composables/useTaskDialog'

const props = defineProps<{ columnId: string }>()

const store = useBoardStore()
const { openCreate } = useTaskDialog()

const expanded = ref(false)
const title = ref('')

const columnName = computed(() => store.columnById.get(props.columnId)?.name ?? '')

function open() {
  expanded.value = true
}

function collapse() {
  expanded.value = false
  title.value = ''
}

async function onEnter() {
  const trimmed = title.value.trim()
  if (trimmed) {
    await store.createTask({ title: trimmed, columnId: props.columnId })
    title.value = ''
  }
}

function onEscape() {
  collapse()
}

function onBlur() {
  if (!title.value.trim()) collapse()
}

function openFullForm() {
  openCreate(props.columnId, title.value.trim())
}
</script>

<template>
  <Button
    v-if="!expanded"
    variant="ghost"
    class="w-full justify-start text-muted-foreground"
    @click="open"
  >
    + Add task
  </Button>
  <div v-else class="flex items-center gap-1">
    <Input
      v-model="title"
      autofocus
      placeholder="Task title…"
      :aria-label="`New task title in ${columnName}`"
      @keydown.enter="onEnter"
      @keydown.escape="onEscape"
      @blur="onBlur"
    />
    <Button
      variant="ghost"
      size="icon"
      aria-label="Open full form"
      @click="openFullForm"
    >
      <Maximize2 />
    </Button>
  </div>
</template>
