<script setup lang="ts">
import { computed } from 'vue'
import { ChartColumn, Plus } from '@lucide/vue'
import { useBoardStore } from '../stores/board'
import { useTaskDialog } from '../composables/useTaskDialog'

const store = useBoardStore()
await callOnce('board', () => store.load())

const { openCreate } = useTaskDialog()
const kpiOpen = useState('kpiOpen', () => false)

const filterValue = computed<string>({
  get() {
    if (store.projectFilter === null) return '__all'
    if (store.projectFilter === 'none') return '__none'
    return store.projectFilter
  },
  set(value: string) {
    if (value === '__all') store.projectFilter = null
    else if (value === '__none') store.projectFilter = 'none'
    else store.projectFilter = value
  },
})
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden">
    <header class="bg-background/80 backdrop-blur border-b px-4 h-14 flex items-center gap-3">
      <h1 class="font-semibold">
        <ScoutLogo decorative class="h-5 w-auto text-foreground dark:text-brand-lime" />
        <span class="sr-only">Scout</span>
      </h1>
      <Select v-model="filterValue">
        <SelectTrigger class="w-48">
          <SelectValue placeholder="All projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All projects</SelectItem>
          <SelectItem value="__none">No project</SelectItem>
          <SelectItem v-for="p in store.projects" :key="p.id" :value="p.id">
            <span class="flex items-center gap-2">
              <span class="size-2 rounded-full" :style="{ background: `var(--swatch-${p.color})` }" aria-hidden="true" />
              {{ p.name }}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <div class="flex-1" />
      <Button @click="openCreate()">
        <Plus />
        New task
      </Button>
      <Button
        variant="outline"
        aria-haspopup="dialog"
        @click="kpiOpen = true"
      >
        <ChartColumn />
        KPIs
      </Button>
      <ColorModeToggle />
    </header>
    <div v-if="store.lastError" role="alert" class="bg-destructive/10 text-destructive text-sm px-4 py-2 flex justify-between">
      <span>{{ store.lastError }}</span>
      <Button variant="ghost" size="sm" @click="store.lastError = null">
        Dismiss
      </Button>
    </div>
    <div class="flex min-h-0 flex-1">
      <main class="min-h-0 min-w-0 flex-1 overflow-hidden">
        <KanbanBoard />
      </main>
    </div>
    <Sheet v-model:open="kpiOpen">
      <SheetContent side="right" class="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:w-[50vw] data-[side=right]:sm:min-w-[40rem] data-[side=right]:sm:max-w-none">
        <SheetHeader class="sr-only">
          <SheetTitle>KPIs</SheetTitle>
          <SheetDescription>Metrics for the current project filter</SheetDescription>
        </SheetHeader>
        <KpiPanel />
      </SheetContent>
    </Sheet>
    <TaskDialog />
  </div>
</template>
