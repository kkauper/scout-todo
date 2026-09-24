<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBoardStore } from '../../stores/board'

const store = useBoardStore()

const activeId = ref<string | null>(store.visibleColumns[0]?.id ?? null)

let observer: IntersectionObserver | null = null

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function scrollToColumn(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-column-section="${id}"]`)
  el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' })
}

function observeColumns() {
  observer?.disconnect()
  const root = document.querySelector<HTMLElement>('[data-board-scroller]')
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeId.value = (entry.target as HTMLElement).dataset.columnSection ?? null
        }
      }
    },
    { root, threshold: 0.6 },
  )
  const sections = document.querySelectorAll<HTMLElement>('[data-column-section]')
  sections.forEach((section) => observer?.observe(section))
}

watch(
  () => store.visibleColumns.map((c) => c.id).join(),
  async () => {
    await nextTick()
    observeColumns()
  },
)

watch(activeId, async (id) => {
  if (!id) return
  await nextTick()
  document.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
})

onMounted(() => {
  observeColumns()
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <nav aria-label="Columns" class="md:hidden shrink-0 overflow-x-auto border-b px-2 py-1.5">
    <div class="flex gap-1">
      <Button
        v-for="c in store.visibleColumns"
        :key="c.id"
        variant="ghost"
        size="sm"
        :data-tab-id="c.id"
        :aria-current="activeId === c.id ? 'true' : undefined"
        class="shrink-0 gap-1.5 aria-[current=true]:bg-muted aria-[current=true]:text-foreground"
        @click="scrollToColumn(c.id)"
      >
        {{ c.name }}
        <Badge variant="secondary">{{ store.tasksByColumn(c.id).length }}</Badge>
      </Button>
    </div>
  </nav>
</template>
