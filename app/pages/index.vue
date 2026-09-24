<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { ChartColumn, Folder, Plus, Search } from '@lucide/vue'
import { useBoardStore } from '../stores/board'
import { useTaskDialog } from '../composables/useTaskDialog'
import { useTaskPanel } from '../composables/useTaskPanel'

const store = useBoardStore()
await callOnce('board', () => store.load())

const { openCreate } = useTaskDialog()
const { taskId, closeTask } = useTaskPanel()
const kpiOpen = useState('kpiOpen', () => false)
const searchOpen = ref(false)

const isMobile = useMediaQuery('(max-width: 767.98px)')
const panelOpen = computed(() => !!taskId.value)

useEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchOpen.value = !searchOpen.value
  }
})

async function onSignOut() {
  const { clear } = useUserSession()
  await clear()
  reloadNuxtApp({ path: '/login' })
}

watch(kpiOpen, (open) => {
  if (open) closeTask()
})

const route = useRoute()
const initial = typeof route.query.task === 'string' ? route.query.task : null
if (initial) {
  const t = store.tasks.find((x) => x.id === initial)
  if (t) {
    if (!store.visibleTasks.some((x) => x.id === initial)) store.projectFilter = null
    taskId.value = initial
  }
  else {
    const query = { ...route.query }
    delete query.task
    await navigateTo({ query }, { replace: true })
  }
}

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
  <div class="flex h-dvh flex-col overflow-clip">
    <a href="#board" class="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring">Skip to board</a>
    <header :inert="panelOpen && isMobile" class="bg-background/80 backdrop-blur border-b px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-3">
      <h1 class="font-semibold shrink-0">
        <ScoutLogo decorative class="h-5 w-auto text-foreground dark:text-brand-lime" />
        <span class="sr-only">Scout</span>
      </h1>
      <Select v-model="filterValue">
        <SelectTrigger class="min-w-0 flex-1 sm:flex-none sm:w-48">
          <SelectValue placeholder="All projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All projects</SelectItem>
          <SelectItem value="__none">No project</SelectItem>
          <SelectItem v-for="p in store.projects" :key="p.id" :value="p.id">
            <span class="flex items-center gap-2">
              <Folder class="size-3.5" :style="{ color: `var(--swatch-${p.color})` }" aria-hidden="true" />
              {{ p.name }}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <div class="hidden sm:block flex-1" />
      <Button
        variant="outline"
        class="shrink-0 max-sm:size-9 max-sm:px-0 sm:w-56 sm:justify-start sm:text-muted-foreground"
        aria-keyshortcuts="Meta+K Control+K"
        @click="searchOpen = true"
      >
        <Search />
        <span class="max-sm:sr-only">Search…</span>
        <kbd class="ml-auto hidden sm:inline text-xs">⌘K</kbd>
      </Button>
      <RunningTimer />
      <Button class="shrink-0 max-sm:size-9 max-sm:px-0" @click="openCreate()">
        <Plus />
        <span class="max-sm:sr-only">New task</span>
      </Button>
      <Button
        variant="outline"
        aria-haspopup="dialog"
        class="shrink-0 max-sm:size-9 max-sm:px-0"
        @click="kpiOpen = true"
      >
        <ChartColumn />
        <span class="max-sm:sr-only">KPIs</span>
      </Button>
      <AccountMenu />
    </header>
    <div v-if="store.lastError" role="alert" class="bg-destructive/10 text-destructive text-sm px-4 py-2 flex justify-between">
      <span>{{ store.lastError }}</span>
      <Button variant="ghost" size="sm" @click="store.lastError = null">
        Dismiss
      </Button>
    </div>
    <div v-if="store.timerNotice" class="bg-muted text-foreground text-sm px-4 py-2 flex justify-between">
      <span>{{ store.timerNotice }}</span>
      <Button variant="ghost" size="sm" @click="store.timerNotice = null">
        Dismiss
      </Button>
    </div>
    <div class="relative flex min-h-0 flex-1 overflow-clip">
      <main id="board" tabindex="-1" :inert="panelOpen && isMobile" class="min-h-0 min-w-0 flex-1 overflow-hidden outline-none">
        <div v-if="store.loadError && !store.loaded" class="flex h-full items-center justify-center p-6">
          <div role="alert" class="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 text-center">
            <h2 class="text-lg font-semibold">Board unavailable</h2>
            <p class="text-sm text-muted-foreground">{{ store.loadError }}</p>
            <div class="flex justify-center gap-2">
              <Button variant="outline" @click="onSignOut">Sign out</Button>
              <Button @click="store.load()">Try again</Button>
            </div>
          </div>
        </div>
        <KanbanBoard v-else />
      </main>
      <TaskPanel />
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
    <SearchPalette v-model:open="searchOpen" />
  </div>
</template>
