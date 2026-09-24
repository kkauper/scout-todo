<script setup lang="ts">
import { computed } from 'vue'
import { Square, Timer } from '@lucide/vue'
import { TIMER_MIN_ENTRY_SECONDS } from '#shared/types/domain'
import { formatClock, formatDuration, taskTrackedSeconds } from '#shared/utils/timer'
import { useBoardStore } from '../../stores/board'
import { useTaskPanel } from '../../composables/useTaskPanel'
import { useLiveAnnouncer } from '../../composables/useLiveAnnouncer'

const store = useBoardStore()
const { openTask } = useTaskPanel()
const { announce } = useLiveAnnouncer()

const timerNow = useState('timerNow', () => Date.now())

const task = computed(() => {
  const taskId = store.runningTimer?.taskId
  return taskId ? store.tasks.find((t) => t.id === taskId) ?? null : null
})

const title = computed(() => task.value?.title ?? '')

const liveSeconds = computed(() => {
  const taskId = store.runningTimer?.taskId
  if (!taskId) return 0
  return taskTrackedSeconds(taskId, store.timeTotals, store.runningTimer, new Date(timerNow.value))
})

function openRunningTask() {
  const taskId = store.runningTimer?.taskId
  if (!taskId) return
  if (!store.visibleTasks.some((t) => t.id === taskId)) store.projectFilter = null
  openTask(taskId)
}

async function onStopTimer() {
  const total = liveSeconds.value
  await store.stopTimer()
  if (total < TIMER_MIN_ENTRY_SECONDS) announce(`Timer stopped for “${title.value}” — under a minute, not recorded`)
  else announce(`Timer stopped for “${title.value}”, ${formatDuration(total)} tracked`)
}
</script>

<template>
  <div v-if="store.runningTimer && task" class="flex shrink-0 items-center">
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="rounded-r-none border-r-0"
      :aria-label="`Open running timer task “${title}”`"
      @click="openRunningTask"
    >
      <Timer class="size-3.5 shrink-0" />
      <ClientOnly>
        <span aria-hidden="true" class="tabular-nums">{{ formatClock(liveSeconds) }}</span>
      </ClientOnly>
      <span class="max-sm:hidden truncate max-w-32">{{ title }}</span>
    </Button>
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="rounded-l-none px-2"
      aria-label="Stop timer"
      @click="onStopTimer"
    >
      <Square class="size-3.5" />
    </Button>
  </div>
</template>
