<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useIntervalFn, useNow } from '@vueuse/core'
import { AlertCircle, Ban, Check, EllipsisVertical, Pencil, Play, Square, Timer as TimerIcon, X } from '@lucide/vue'
import type { BoardColumn, Task } from '#shared/types/domain'
import { TASK_SIZE_HINTS, TASK_SIZE_LABELS, TIMER_MIN_ENTRY_SECONDS } from '#shared/types/domain'
import { daysBetween, isOverdue, localDateIso } from '#shared/utils/dates'
import { isBlocked } from '#shared/utils/links'
import { formatClock, formatDuration, taskTrackedSeconds } from '#shared/utils/timer'
import { useBoardStore } from '../../stores/board'
import { useTaskPanel } from '../../composables/useTaskPanel'
import { useLiveAnnouncer } from '../../composables/useLiveAnnouncer'

const props = defineProps<{ task: Task }>()

const store = useBoardStore()
const { taskId, openTask } = useTaskPanel()
const { announce } = useLiveAnnouncer()

const isOpen = computed(() => taskId.value === props.task.id)

const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 60_000) })

const confirmOpen = ref(false)

const inlineEditing = useState('inlineEditing', () => false)
const editingTitle = ref(false)
const draftTitle = ref('')
const titleInputRef = ref()

const column = computed(() => store.columnById.get(props.task.columnId))
const kind = computed(() => column.value?.kind ?? 'open')

function startEdit() {
  draftTitle.value = props.task.title
  editingTitle.value = true
  inlineEditing.value = true
  nextTick(() => {
    const el = titleInputRef.value?.$el as HTMLInputElement | undefined
    el?.select()
  })
}

function cancelTitle() {
  editingTitle.value = false
  inlineEditing.value = false
}

function commitTitle() {
  if (!editingTitle.value) return
  const trimmed = draftTitle.value.trim()
  if (trimmed && trimmed !== props.task.title) {
    store.updateTask(props.task.id, { title: trimmed })
  }
  editingTitle.value = false
  inlineEditing.value = false
}

const otherColumns = computed(() => store.visibleColumns.filter((c) => c.id !== props.task.columnId))

const overdue = computed(() => isOverdue(props.task, kind.value, now.value))
const daysInColumn = computed(() => Math.floor(daysBetween(props.task.stateChangedAt, now.value)))

function taskIsDone(id: string): boolean {
  const task = store.tasks.find((t) => t.id === id)
  return task ? store.columnById.get(task.columnId)?.kind === 'done' : false
}
const blocked = computed(() => isBlocked(props.task.id, store.links, taskIsDone))
const blockerTitle = computed(() => {
  const titles = store.links
    .filter((l) => l.type === 'blocks' && l.toTaskId === props.task.id && !taskIsDone(l.fromTaskId))
    .map((l) => store.tasks.find((t) => t.id === l.fromTaskId)?.title)
    .filter((t): t is string => !!t)
  return `Blocked by ${titles.join(', ')}`
})

const checklistDone = computed(() => props.task.checklist.filter((i) => i.done).length)
const checklistTotal = computed(() => props.task.checklist.length)

const timerNow = useState('timerNow', () => Date.now())
const isRunningHere = computed(() => store.runningTimer?.taskId === props.task.id)
const liveSeconds = computed(() => taskTrackedSeconds(props.task.id, store.timeTotals, store.runningTimer, new Date(timerNow.value)))
const timerButtonLabel = computed(() => isRunningHere.value
  ? `Stop timer for “${props.task.title}”, ${formatDuration(liveSeconds.value)} tracked`
  : `Start timer for “${props.task.title}”`)

async function onStartTimer() {
  const prevTaskId = store.runningTimer?.taskId
  const prevTask = prevTaskId && prevTaskId !== props.task.id ? store.tasks.find((t) => t.id === prevTaskId) : null
  const prevLiveSeconds = prevTaskId ? taskTrackedSeconds(prevTaskId, store.timeTotals, store.runningTimer, new Date()) : 0
  await store.startTimer(props.task.id)
  if (prevTask) {
    const prevStopText = prevLiveSeconds < TIMER_MIN_ENTRY_SECONDS
      ? `Timer stopped for “${prevTask.title}” — under a minute, not recorded.`
      : `Timer stopped for “${prevTask.title}”.`
    announce(`${prevStopText} Timer started for “${props.task.title}”.`)
  }
  else announce(`Timer started for “${props.task.title}”`)
}

async function onStopTimer() {
  const total = liveSeconds.value
  await store.stopTimer()
  if (total < TIMER_MIN_ENTRY_SECONDS) announce(`Timer stopped for “${props.task.title}” — under a minute, not recorded`)
  else announce(`Timer stopped for “${props.task.title}”, ${formatDuration(total)} tracked`)
}

const metaText = computed(() => {
  const parts: string[] = [`${column.value?.name ?? 'Unknown'}.`]
  if (props.task.deadline) {
    parts.push(overdue.value ? `Overdue, due ${props.task.deadline}.` : `Due ${props.task.deadline}.`)
  }
  if (blocked.value) parts.push(`${blockerTitle.value}.`)
  if (props.task.size) parts.push(`Size ${TASK_SIZE_LABELS[props.task.size]}.`)
  if (checklistTotal.value > 0) parts.push(`${checklistDone.value} of ${checklistTotal.value} sub-todos done.`)
  if (isRunningHere.value) parts.push('Timer running.')
  else if (liveSeconds.value > 0) parts.push(`${formatDuration(liveSeconds.value)} tracked.`)
  parts.push('Alt plus arrow keys to move.')
  return parts.join(' ')
})

const columnTaskIds = computed(() => store.tasksByColumn(props.task.columnId).map((t) => t.id))
const indexInColumn = computed(() => columnTaskIds.value.indexOf(props.task.id))
const canMoveUp = computed(() => indexInColumn.value > 0)
const canMoveDown = computed(() => indexInColumn.value !== -1 && indexInColumn.value < columnTaskIds.value.length - 1)

async function refocusCard() {
  await nextTick()
  const el = document.querySelector<HTMLElement>(`[data-task-id="${props.task.id}"] [data-card-open]`)
  el?.focus()
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function announceMove() {
  const list = store.tasksByColumn(props.task.columnId)
  const pos = list.findIndex((t) => t.id === props.task.id) + 1
  announce(`Moved "${props.task.title}" to ${column.value?.name ?? ''}, position ${pos} of ${list.length}.`)
}

async function moveWithin(delta: -1 | 1) {
  const ok = await store.moveTaskWithinColumn(props.task.id, delta)
  if (ok) {
    await refocusCard()
    announceMove()
  }
  else {
    announce(`"${props.task.title}" is already at the ${delta === -1 ? 'top' : 'bottom'}`)
  }
}

async function moveAcross(direction: -1 | 1) {
  const ok = await store.moveTaskToAdjacentColumn(props.task.id, direction)
  if (ok) {
    await refocusCard()
    announceMove()
  }
  else {
    announce(`"${props.task.title}" is already in the ${direction === -1 ? 'first' : 'last'} column`)
  }
}

async function moveToColumn(target: BoardColumn) {
  const toIndex = store.tasksByColumn(target.id).length
  await store.moveTask(props.task.id, target.id, toIndex)
  announce(`Moved "${props.task.title}" to ${target.name}, position ${toIndex + 1} of ${store.tasksByColumn(target.id).length}.`)
}

function onTitleKeydown(e: KeyboardEvent) {
  if (!e.altKey) return
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveWithin(-1)
  }
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveWithin(1)
  }
  else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    moveAcross(-1)
  }
  else if (e.key === 'ArrowRight') {
    e.preventDefault()
    moveAcross(1)
  }
}

function onDelete() {
  store.deleteTask(props.task.id)
}
</script>

<template>
  <Card class="cursor-grab gap-2 py-3" :data-no-open="editingTitle ? '' : undefined">
    <CardHeader class="flex flex-row items-start justify-between gap-2 px-3">
      <CardTitle class="flex-1 text-sm font-medium line-clamp-2">
        <button
          v-if="!editingTitle"
          type="button"
          data-card-open
          class="line-clamp-2 text-left text-sm font-medium outline-none rounded-sm"
          :aria-describedby="`task-meta-${task.id}`"
          :aria-current="isOpen ? 'true' : undefined"
          @click.stop="openTask(task.id)"
          @keydown="onTitleKeydown"
        >{{ task.title }}</button>
        <div v-else class="flex items-center gap-1">
          <Input
            ref="titleInputRef"
            v-model="draftTitle"
            autofocus
            data-no-drag
            data-no-open
            class="h-7 bg-transparent dark:bg-transparent shadow-none px-1.5 text-sm font-medium"
            @keydown.enter.stop="commitTitle"
            @keydown.escape.stop="cancelTitle"
            @keydown.space.stop
            @blur="commitTitle"
          />
          <Button
            variant="ghost"
            size="icon"
            class="size-6 shrink-0"
            aria-label="Save title"
            data-no-drag
            data-no-open
            @mousedown.prevent
            @click.stop="commitTitle"
          >
            <Check class="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-6 shrink-0"
            aria-label="Cancel rename"
            data-no-drag
            data-no-open
            @mousedown.prevent
            @click.stop="cancelTitle"
          >
            <X class="size-3.5" />
          </Button>
        </div>
        <span :id="`task-meta-${task.id}`" class="sr-only">{{ metaText }}</span>
      </CardTitle>
      <div class="flex shrink-0 items-center gap-0.5">
        <Button
          v-if="!editingTitle"
          variant="ghost"
          size="icon"
          class="size-6 opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100"
          aria-label="Rename task"
          data-no-drag
          @click.stop="startEdit"
        >
          <Pencil class="size-3.5" />
        </Button>
        <Button
          v-if="!editingTitle"
          type="button"
          variant="ghost"
          size="icon"
          :class="isRunningHere ? 'h-6 w-auto shrink-0 gap-1 px-1.5' : 'size-6 shrink-0 text-muted-foreground hover:text-foreground'"
          :aria-label="timerButtonLabel"
          data-no-drag
          @click.stop="isRunningHere ? onStopTimer() : onStartTimer()"
        >
          <component :is="isRunningHere ? Square : Play" class="size-3.5 shrink-0" />
          <ClientOnly v-if="isRunningHere">
            <span aria-hidden="true" class="tabular-nums text-xs font-medium text-primary">{{ formatClock(liveSeconds) }}</span>
          </ClientOnly>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" aria-label="Task actions" data-no-drag>
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="openTask(task.id)">
              Open
            </DropdownMenuItem>
            <DropdownMenuItem @click="isRunningHere ? onStopTimer() : onStartTimer()">
              <component :is="isRunningHere ? Square : Play" class="size-3.5" />
              {{ isRunningHere ? 'Stop timer' : 'Start timer' }}
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="!canMoveUp" @click="moveWithin(-1)">
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="!canMoveDown" @click="moveWithin(1)">
              Move down
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  v-for="c in otherColumns"
                  :key="c.id"
                  @click="moveToColumn(c)"
                >
                  {{ c.name }}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" @select="() => nextTick(() => (confirmOpen = true))">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </CardHeader>
    <CardContent class="group/badges flex flex-wrap items-center gap-1 px-3">
      <ProjectPicker
        :model-value="task.projectId"
        @update:model-value="(v) => store.updateTask(task.id, { projectId: v })"
      >
        <template #default="{ project: pickedProject, open: pickerOpen }">
          <button
            type="button"
            :aria-label="pickedProject ? `Project: ${pickedProject.name}. Change project` : 'Assign project'"
            :class="pickedProject ? 'order-1 inline-flex min-h-6 items-center rounded-md focus-visible:ring-2 focus-visible:ring-ring outline-none' : ['order-3 min-h-6 items-center rounded-full border border-dashed px-2 text-xs text-muted-foreground', pickerOpen ? 'inline-flex' : 'hidden group-hover/card:inline-flex group-focus-within/card:inline-flex']"
            @dblclick.stop
            @keydown.stop
          >
            <ProjectBadge v-if="pickedProject" :label="pickedProject.name" :color="pickedProject.color" />
            <template v-else>+ Project</template>
          </button>
        </template>
      </ProjectPicker>
      <TagPicker
        :model-value="task.tagIds"
        @update:model-value="(v) => store.updateTask(task.id, { tagIds: v })"
      >
        <template #default="{ tags: pickedTags, open: pickerOpen }">
          <button
            type="button"
            aria-label="Edit tags"
            :class="pickedTags.length ? 'order-2 flex min-h-6 items-center gap-1 rounded-full focus-visible:ring-2 focus-visible:ring-ring outline-none' : ['order-4 min-h-6 items-center rounded-full border border-dashed px-2 text-xs text-muted-foreground', pickerOpen ? 'inline-flex' : 'hidden group-hover/card:inline-flex group-focus-within/card:inline-flex']"
            @dblclick.stop
            @keydown.stop
          >
            <template v-if="pickedTags.length">
              <ColorBadge v-for="tag in pickedTags" :key="tag.id" :label="tag.name" :color="tag.color" />
              <span class="text-xs text-muted-foreground">+</span>
            </template>
            <template v-else>+ Tag</template>
          </button>
        </template>
      </TagPicker>
      <TooltipProvider v-if="task.size">
        <Tooltip>
          <TooltipTrigger as-child>
            <Badge
              variant="outline"
              class="order-5 h-5 px-1.5 text-[10px] font-semibold"
              :aria-label="`Size ${TASK_SIZE_LABELS[task.size]}`"
            >
              {{ TASK_SIZE_LABELS[task.size] }}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{{ TASK_SIZE_HINTS[task.size] }}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </CardContent>
    <CardChecklist :task="task" class="px-3" />
    <div class="px-3 text-xs text-muted-foreground flex items-center gap-3">
      <TooltipProvider v-if="blocked">
        <Tooltip>
          <TooltipTrigger as-child>
            <Ban
              role="img"
              aria-label="Blocked"
              class="size-3.5 shrink-0 text-destructive"
            />
          </TooltipTrigger>
          <TooltipContent>{{ blockerTitle }}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <template v-if="task.deadline">
        <span v-if="overdue" class="text-destructive font-medium flex items-center gap-1">
          <AlertCircle class="size-3.5" />
          Overdue · {{ task.deadline }}
        </span>
        <span v-else>Due {{ task.deadline }}</span>
      </template>
      <span v-if="kind === 'done' && task.completedAt">Done {{ localDateIso(new Date(task.completedAt)) }}</span>
      <span v-else-if="kind !== 'done'">{{ daysInColumn }}d in {{ column?.name ?? 'Unknown' }}</span>
      <span v-if="!isRunningHere && liveSeconds > 0" aria-hidden="true" class="flex items-center gap-1">
        <TimerIcon class="size-3.5 shrink-0" />
        {{ formatDuration(liveSeconds) }}
      </span>
    </div>
  </Card>
  <AlertDialog v-model:open="confirmOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete task?</AlertDialogTitle>
        <AlertDialogDescription>{{ task.title }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click="onDelete">
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
