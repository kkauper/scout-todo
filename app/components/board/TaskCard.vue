<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useIntervalFn, useNow } from '@vueuse/core'
import { AlertCircle, Check, EllipsisVertical, Pencil, X } from '@lucide/vue'
import type { Task } from '#shared/types/domain'
import { daysBetween, isOverdue, localDateIso } from '#shared/utils/dates'
import { useBoardStore } from '../../stores/board'
import { useTaskDialog } from '../../composables/useTaskDialog'

const props = defineProps<{ task: Task }>()

const store = useBoardStore()
const { openEdit } = useTaskDialog()

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

function onDelete() {
  store.deleteTask(props.task.id)
}
</script>

<template>
  <Card class="cursor-grab gap-2 py-3" :data-no-open="editingTitle ? '' : undefined">
    <CardHeader class="flex flex-row items-start justify-between gap-2 px-3">
      <CardTitle class="flex-1 text-sm font-medium line-clamp-2">
        <span v-if="!editingTitle" class="line-clamp-2 text-sm font-medium">
          {{ task.title }}
        </span>
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
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" aria-label="Task actions" data-no-drag>
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="openEdit(task.id)">
              Edit
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  v-for="c in otherColumns"
                  :key="c.id"
                  @click="store.moveTask(task.id, c.id, store.tasksByColumn(c.id).length)"
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
        <template #default="{ project: pickedProject }">
          <button
            v-if="pickedProject"
            type="button"
            :aria-label="`Project: ${pickedProject.name}. Change project`"
            class="order-1 rounded-md focus-visible:ring-2 focus-visible:ring-ring outline-none"
            @dblclick.stop
            @keydown.stop
          >
            <ProjectBadge :label="pickedProject.name" :color="pickedProject.color" />
          </button>
          <button
            v-else
            type="button"
            aria-label="Assign project"
            class="order-3 hidden h-5.5 rounded-full border border-dashed px-2 text-xs text-muted-foreground group-hover/card:inline-flex group-focus-within/card:inline-flex"
            @dblclick.stop
            @keydown.stop
          >
            + Project
          </button>
        </template>
      </ProjectPicker>
      <TagPicker
        :model-value="task.tagIds"
        @update:model-value="(v) => store.updateTask(task.id, { tagIds: v })"
      >
        <template #default="{ tags: pickedTags }">
          <button
            v-if="pickedTags.length"
            type="button"
            aria-label="Edit tags"
            class="order-2 flex items-center gap-1 rounded-full focus-visible:ring-2 focus-visible:ring-ring outline-none"
            @dblclick.stop
            @keydown.stop
          >
            <ColorBadge v-for="tag in pickedTags" :key="tag.id" :label="tag.name" :color="tag.color" />
            <span class="text-xs text-muted-foreground">+</span>
          </button>
          <button
            v-else
            type="button"
            aria-label="Edit tags"
            class="order-4 hidden h-5.5 rounded-full border border-dashed px-2 text-xs text-muted-foreground group-hover/card:inline-flex group-focus-within/card:inline-flex"
            @dblclick.stop
            @keydown.stop
          >
            + Tag
          </button>
        </template>
      </TagPicker>
    </CardContent>
    <CardChecklist :task="task" class="px-3" />
    <div class="px-3 text-xs text-muted-foreground flex gap-3">
      <template v-if="task.deadline">
        <span v-if="overdue" class="text-destructive font-medium flex items-center gap-1">
          <AlertCircle class="size-3.5" />
          Overdue · {{ task.deadline }}
        </span>
        <span v-else>Due {{ task.deadline }}</span>
      </template>
      <span v-if="kind === 'done' && task.completedAt">Done {{ localDateIso(new Date(task.completedAt)) }}</span>
      <span v-else-if="kind !== 'done'">{{ daysInColumn }}d in {{ column?.name ?? 'Unknown' }}</span>
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
