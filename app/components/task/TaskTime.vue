<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronRight, Pencil, Play, Plus, Square, X } from '@lucide/vue'
import type { TimeEntry } from '#shared/types/domain'
import { ENTRY_TIMES_ERROR_MESSAGES, TIMER_MIN_ENTRY_SECONDS } from '#shared/types/domain'
import { durationSeconds, formatClock, formatDuration, fromDateTimeLocalValue, taskTrackedSeconds, toDateTimeLocalValue, validateEntryTimes } from '#shared/utils/timer'
import { useBoardStore } from '../../stores/board'
import { useLiveAnnouncer } from '../../composables/useLiveAnnouncer'

const props = defineProps<{ taskId: string }>()

const store = useBoardStore()
const { announce } = useLiveAnnouncer()

const task = computed(() => store.tasks.find((t) => t.id === props.taskId) ?? null)
const title = computed(() => task.value?.title ?? '')

const timerNow = useState('timerNow', () => Date.now())
const isRunningHere = computed(() => store.runningTimer?.taskId === props.taskId)
const liveSeconds = computed(() => taskTrackedSeconds(props.taskId, store.timeTotals, store.runningTimer, new Date(timerNow.value)))

const timerButtonLabel = computed(() => isRunningHere.value
  ? `Stop timer for “${title.value}”, ${formatDuration(liveSeconds.value)} tracked`
  : `Start timer for “${title.value}”`)

const startStopButtonRef = ref<{ $el: HTMLElement } | null>(null)
const addTimeButtonRef = ref<{ $el: HTMLElement } | null>(null)
const addTimeOpen = ref(false)
const entriesOpen = ref(false)

async function onStartTimer() {
  const prevTaskId = store.runningTimer?.taskId
  const prevTask = prevTaskId && prevTaskId !== props.taskId ? store.tasks.find((t) => t.id === prevTaskId) : null
  const prevLiveSeconds = prevTaskId ? taskTrackedSeconds(prevTaskId, store.timeTotals, store.runningTimer, new Date()) : 0
  await store.startTimer(props.taskId)
  if (prevTask) {
    const prevStopText = prevLiveSeconds < TIMER_MIN_ENTRY_SECONDS
      ? `Timer stopped for “${prevTask.title}” — under a minute, not recorded.`
      : `Timer stopped for “${prevTask.title}”.`
    announce(`${prevStopText} Timer started for “${title.value}”.`)
  }
  else announce(`Timer started for “${title.value}”`)
  await loadEntries()
}

async function onStopTimer() {
  const total = liveSeconds.value
  await store.stopTimer()
  if (total < TIMER_MIN_ENTRY_SECONDS) announce(`Timer stopped for “${title.value}” — under a minute, not recorded`)
  else announce(`Timer stopped for “${title.value}”, ${formatDuration(total)} tracked`)
  await loadEntries()
}

// --- Entries -------------------------------------------------------------

const entries = ref<TimeEntry[]>([])

async function loadEntries() {
  entries.value = await store.fetchTimeEntries(props.taskId)
}

watch(() => props.taskId, loadEntries, { immediate: true })
watch(() => store.revision, () => { loadEntries() })

function formatDatePart(d: Date): string {
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatTimePart(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function entryLabel(entry: TimeEntry): string {
  const start = new Date(entry.startedAt)
  if (entry.endedAt === null) return `${formatTimePart(start)}–now · running`
  const end = new Date(entry.endedAt)
  const seconds = durationSeconds(entry.startedAt, entry.endedAt)
  return `${formatDatePart(start)}, ${formatTimePart(start)}–${formatTimePart(end)} · ${formatDuration(seconds)}`
}

async function deleteEntry(entry: TimeEntry, index: number) {
  await store.deleteTimeEntry(entry)
  announce('Entry deleted')
  await loadEntries()
  await nextTick()
  const next = entries.value[index]
  const el = next ? document.getElementById(`time-entry-delete-${next.id}`) : null
  if (el) el.focus()
  else startStopButtonRef.value?.$el?.focus()
}

// --- Edit ------------------------------------------------------------------

const editingId = ref<string | null>(null)
const startDraft = ref('')
const endDraft = ref('')
const editError = ref<string | null>(null)
const saving = ref(false)

const draftStart = computed(() => fromDateTimeLocalValue(startDraft.value))
const draftEnd = computed(() => fromDateTimeLocalValue(endDraft.value))
const draftSeconds = computed(() => draftStart.value && draftEnd.value
  ? durationSeconds(draftStart.value.toISOString(), draftEnd.value.toISOString())
  : null)

const editingEntry = computed(() => entries.value.find((e) => e.id === editingId.value) ?? null)

const deltaSeconds = computed(() => editingEntry.value && draftSeconds.value !== null
  ? draftSeconds.value - durationSeconds(editingEntry.value.startedAt, editingEntry.value.endedAt!)
  : 0)
const saveLabel = computed(() => Math.abs(deltaSeconds.value) >= 7200
  ? `Save (${deltaSeconds.value < 0 ? '−' : '+'}${formatDuration(Math.abs(deltaSeconds.value))})`
  : 'Save')

watch(() => props.taskId, () => { editingId.value = null })

async function startEdit(entry: TimeEntry) {
  editingId.value = entry.id
  startDraft.value = toDateTimeLocalValue(entry.startedAt)
  endDraft.value = toDateTimeLocalValue(entry.endedAt!)
  editError.value = null
  await nextTick()
  document.getElementById(`time-entry-start-${entry.id}`)?.focus()
}

async function cancelEdit() {
  const id = editingId.value
  editingId.value = null
  editError.value = null
  await nextTick()
  if (id) document.getElementById(`time-entry-edit-${id}`)?.focus()
}

async function saveEdit() {
  const entry = editingEntry.value
  if (!entry || saving.value) return

  const start = draftStart.value
  const end = draftEnd.value
  if (!start || !end) {
    editError.value = 'Enter a valid start and end.'
    return
  }

  const err = validateEntryTimes(start, end, new Date())
  if (err) {
    editError.value = ENTRY_TIMES_ERROR_MESSAGES[err]
    return
  }

  saving.value = true
  const result = await store.updateTimeEntry(entry, { startedAt: start.toISOString(), endedAt: end.toISOString() })
  saving.value = false

  if (!result) {
    editError.value = store.lastError ?? 'Couldn\'t save the entry.'
    return
  }

  announce(`Entry updated, ${formatDuration(durationSeconds(result.startedAt, result.endedAt!))}`)
  await loadEntries()
  await cancelEdit()
}

// --- Quick add -------------------------------------------------------------

const QUICK_OPTIONS = [
  { minutes: 15, label: '+15 min' },
  { minutes: 30, label: '+30 min' },
  { minutes: 60, label: '+1 h' },
]

const minutesDraft = ref('')
const minutesError = ref<string | null>(null)

async function closeAddTime() {
  addTimeOpen.value = false
  await nextTick()
  addTimeButtonRef.value?.$el?.focus()
}

async function addQuick(minutes: number) {
  await store.addTime(props.taskId, minutes)
  announce(`Added ${formatDuration(minutes * 60)}`)
  await loadEntries()
  await closeAddTime()
}

async function addCustom() {
  const minutes = Number(minutesDraft.value)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    minutesError.value = 'Enter a whole number of minutes between 1 and 1440.'
    return
  }
  minutesError.value = null
  minutesDraft.value = ''
  await store.addTime(props.taskId, minutes)
  announce(`Added ${formatDuration(minutes * 60)}`)
  await loadEntries()
  await closeAddTime()
}
</script>

<template>
  <div class="space-y-2">
    <h3 class="text-sm font-medium">
      Time
    </h3>

    <div class="flex items-center gap-3">
      <div class="text-2xl font-semibold tabular-nums">
        <ClientOnly v-if="isRunningHere">
          <span aria-hidden="true">{{ formatClock(liveSeconds) }}</span>
        </ClientOnly>
        <span :class="isRunningHere ? 'sr-only' : ''">{{ formatDuration(liveSeconds) }}</span>
      </div>
      <Button
        ref="startStopButtonRef"
        type="button"
        :aria-label="timerButtonLabel"
        @click="isRunningHere ? onStopTimer() : onStartTimer()"
      >
        <component :is="isRunningHere ? Square : Play" class="size-3.5" />
        {{ isRunningHere ? 'Stop' : 'Start' }}
      </Button>

      <Popover v-model:open="addTimeOpen">
        <PopoverTrigger as-child>
          <Button ref="addTimeButtonRef" type="button" variant="ghost" size="sm">
            <Plus class="size-3.5" />
            Add time
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-72 gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <Button
              v-for="opt in QUICK_OPTIONS"
              :key="opt.minutes"
              type="button"
              variant="outline"
              size="sm"
              :aria-label="`Add ${opt.minutes} minutes`"
              @click="addQuick(opt.minutes)"
            >
              {{ opt.label }}
            </Button>
          </div>

          <form class="flex items-end gap-2" @submit.prevent="addCustom">
            <div class="space-y-1">
              <Label for="task-time-minutes">Minutes</Label>
              <Input
                id="task-time-minutes"
                v-model="minutesDraft"
                type="number"
                min="1"
                max="1440"
                class="w-24"
                :aria-invalid="minutesError ? 'true' : undefined"
                :aria-describedby="minutesError ? 'task-time-minutes-error' : undefined"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Add
            </Button>
          </form>
          <p v-if="minutesError" id="task-time-minutes-error" role="alert" class="text-xs text-destructive">
            {{ minutesError }}
          </p>
        </PopoverContent>
      </Popover>
    </div>

    <p v-if="entries.length === 0" class="text-xs text-muted-foreground">
      No time tracked yet
    </p>
    <Collapsible v-else v-model:open="entriesOpen">
      <CollapsibleTrigger as-child>
        <Button type="button" variant="ghost" size="sm" class="gap-1">
          <ChevronRight
            class="size-3.5 transition-transform motion-safe:duration-150"
            :class="entriesOpen ? 'rotate-90' : ''"
            aria-hidden="true"
          />
          Entries ({{ entries.length }})
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul class="space-y-1 pt-1" role="list">
          <li v-for="(entry, i) in entries" :key="entry.id" class="flex items-center gap-2 text-xs text-muted-foreground">
            <template v-if="editingId !== entry.id">
              <span class="flex-1">{{ entryLabel(entry) }}</span>
              <Button
                v-if="entry.endedAt !== null"
                :id="`time-entry-edit-${entry.id}`"
                type="button"
                variant="ghost"
                size="icon"
                class="size-6 shrink-0"
                :aria-label="`Edit entry ${entryLabel(entry)}`"
                @click="startEdit(entry)"
              >
                <Pencil class="size-3.5" />
              </Button>
              <Button
                v-if="entry.endedAt !== null"
                :id="`time-entry-delete-${entry.id}`"
                type="button"
                variant="ghost"
                size="icon"
                class="size-6 shrink-0"
                :aria-label="`Delete entry ${entryLabel(entry)}`"
                @click="deleteEntry(entry, i)"
              >
                <X class="size-3.5" />
              </Button>
            </template>
            <form v-else class="w-full space-y-2 py-1" @submit.prevent="saveEdit" @keydown.esc.prevent.stop="cancelEdit">
              <div class="flex flex-col gap-2 sm:flex-row">
                <div class="space-y-1">
                  <Label :for="`time-entry-start-${entry.id}`">Start</Label>
                  <Input
                    :id="`time-entry-start-${entry.id}`"
                    v-model="startDraft"
                    type="datetime-local"
                    step="60"
                    :aria-invalid="editError ? 'true' : undefined"
                    :aria-describedby="editError ? `time-entry-edit-error-${entry.id}` : undefined"
                  />
                </div>
                <div class="space-y-1">
                  <Label :for="`time-entry-end-${entry.id}`">End</Label>
                  <Input
                    :id="`time-entry-end-${entry.id}`"
                    v-model="endDraft"
                    type="datetime-local"
                    step="60"
                    :aria-invalid="editError ? 'true' : undefined"
                    :aria-describedby="editError ? `time-entry-edit-error-${entry.id}` : undefined"
                  />
                </div>
              </div>
              <p class="text-xs text-muted-foreground tabular-nums">
                Duration: {{ draftSeconds !== null && draftSeconds >= 0 ? formatDuration(draftSeconds) : '—' }}
              </p>
              <p v-if="editError" :id="`time-entry-edit-error-${entry.id}`" role="alert" class="text-xs text-destructive">
                {{ editError }}
              </p>
              <div class="flex gap-2">
                <Button type="submit" size="sm" :disabled="saving">
                  {{ saveLabel }}
                </Button>
                <Button type="button" variant="ghost" size="sm" @click="cancelEdit">
                  Cancel
                </Button>
              </div>
            </form>
          </li>
        </ul>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
