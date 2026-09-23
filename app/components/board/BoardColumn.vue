<script setup lang="ts">
import { computed, nextTick, ref, watch, watchEffect } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { SortableEvent } from 'vue-draggable-plus'
import { Circle, CircleCheck, CircleDot, MoreHorizontal } from '@lucide/vue'
import { COLUMN_KIND_LABELS, COLUMN_KINDS } from '#shared/types/domain'
import type { BoardColumn, ColumnKind, Task } from '#shared/types/domain'
import { useBoardStore } from '../../stores/board'
import { useTaskPanel } from '../../composables/useTaskPanel'

const props = defineProps<{ column: BoardColumn }>()

const store = useBoardStore()
const { taskId, openTask } = useTaskPanel()

const items = ref<Task[]>([])
watchEffect(() => {
  items.value = [...store.tasksByColumn(props.column.id)]
})

const inlineEditing = useState('inlineEditing', () => false)
const wasEditing = ref(false)

function onEnd(evt: SortableEvent) {
  const id = (evt.item as HTMLElement).dataset.taskId
  const to = (evt.to as HTMLElement).dataset.columnId
  if (!id || !to || evt.newIndex == null) return
  store.moveTask(id, to, evt.newIndex)
}

function onCardClick(e: MouseEvent, taskId: string) {
  if (wasEditing.value) return
  const target = e.target as HTMLElement
  if (target.closest('button, a, input, textarea, select, [role="checkbox"], [role="menuitem"], [data-no-open]')) return
  openTask(taskId)
}

const KIND_ICON = { open: Circle, active: CircleDot, done: CircleCheck } as const
const kindIcon = computed(() => KIND_ICON[props.column.kind])

const renaming = ref(false)
const draftName = ref('')

function startRename() {
  draftName.value = props.column.name
  renaming.value = true
  inlineEditing.value = true
}

function commitRename() {
  if (!renaming.value) return
  const trimmed = draftName.value.trim()
  renaming.value = false
  inlineEditing.value = false
  if (trimmed && trimmed !== props.column.name) {
    store.updateColumn(props.column.id, { name: trimmed })
  }
}

function cancelRename() {
  renaming.value = false
  inlineEditing.value = false
}

const isFirstVisible = computed(() => store.visibleColumns[0]?.id === props.column.id)
const isLastVisible = computed(() => store.visibleColumns[store.visibleColumns.length - 1]?.id === props.column.id)
const canHide = computed(() => store.visibleColumns.length > 1)
const canDelete = computed(() => store.columns.length > 1)

function onKindChange(kind: ColumnKind) {
  store.updateColumn(props.column.id, { kind })
}

const confirmDeleteOpen = ref(false)
const moveToId = ref<string | null>(null)
const tasksInColumn = computed(() => store.tasks.filter((t) => t.columnId === props.column.id))
const otherColumns = computed(() => store.sortedColumns.filter((c) => c.id !== props.column.id))

watch(confirmDeleteOpen, (open) => {
  if (!open) return
  const firstOtherVisible = store.visibleColumns.find((c) => c.id !== props.column.id)
  moveToId.value = firstOtherVisible?.id ?? otherColumns.value[0]?.id ?? null
})

async function confirmDelete() {
  await store.deleteColumn(props.column.id, tasksInColumn.value.length > 0 ? (moveToId.value ?? undefined) : undefined)
  confirmDeleteOpen.value = false
}
</script>

<template>
  <section :aria-labelledby="`col-${column.id}`" class="flex h-full min-h-0 min-w-72 max-w-[32rem] flex-[1_1_18rem] flex-col rounded-xl bg-muted/50">
    <div class="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <component :is="kindIcon" role="img" class="size-3.5 shrink-0 text-muted-foreground" :aria-label="COLUMN_KIND_LABELS[column.kind]" />
          </TooltipTrigger>
          <TooltipContent>{{ COLUMN_KIND_LABELS[column.kind] }}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <h2 v-if="!renaming" :id="`col-${column.id}`" class="cursor-text truncate text-sm font-medium" @click.stop="startRename">
        {{ column.name }}
      </h2>
      <Input
        v-else
        v-model="draftName"
        autofocus
        data-no-drag
        class="h-7 bg-transparent dark:bg-transparent shadow-none px-1.5 text-sm font-medium"
        @click.stop
        @keydown.enter.stop="commitRename"
        @keydown.escape.stop="cancelRename"
        @blur="commitRename"
      />

      <Badge variant="secondary">{{ items.length }}</Badge>

      <div class="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" :aria-label="`Column actions for ${column.name}`" data-no-drag>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem @click="startRename">
            Rename
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Type</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup :model-value="column.kind" @update:model-value="(v) => onKindChange(v as ColumnKind)">
                <DropdownMenuRadioItem v-for="k in COLUMN_KINDS" :key="k" :value="k">
                  {{ COLUMN_KIND_LABELS[k] }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem :disabled="isFirstVisible" @click="store.moveColumn(column.id, -1)">
            Move left
          </DropdownMenuItem>
          <DropdownMenuItem :disabled="isLastVisible" @click="store.moveColumn(column.id, 1)">
            Move right
          </DropdownMenuItem>
          <DropdownMenuItem :disabled="!canHide" @click="store.updateColumn(column.id, { hidden: true })">
            Hide
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" :disabled="!canDelete" @select="() => nextTick(() => (confirmDeleteOpen = true))">
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <VueDraggable
      v-model="items"
      group="tasks"
      :animation="150"
      tag="ul"
      role="list"
      :data-column-id="column.id"
      :filter="'[data-no-drag]'"
      :prevent-on-filter="false"
      class="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2 pb-2"
      @end="onEnd"
    >
      <li
        v-for="t in items"
        :key="t.id"
        role="listitem"
        tabindex="0"
        :data-task-id="t.id"
        :aria-label="`${t.title}, ${column.name}`"
        :aria-current="taskId === t.id ? 'true' : undefined"
        class="group/card list-none shrink-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:ring-2 aria-[current=true]:ring-primary"
        @pointerdown.capture="wasEditing = inlineEditing"
        @click="onCardClick($event, t.id)"
        @keydown.enter.self.prevent="openTask(t.id)"
      >
        <TaskCard :task="t" />
      </li>
    </VueDraggable>
    <div class="shrink-0 px-2 pb-2">
      <QuickAddTask :column-id="column.id" />
    </div>
  </section>

  <AlertDialog v-model:open="confirmDeleteOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete column "{{ column.name }}"?</AlertDialogTitle>
        <AlertDialogDescription v-if="tasksInColumn.length === 0">
          This column has no tasks.
        </AlertDialogDescription>
        <AlertDialogDescription v-else>
          It contains {{ tasksInColumn.length }} tasks. Move them to:
        </AlertDialogDescription>
      </AlertDialogHeader>
      <Select v-if="tasksInColumn.length > 0" v-model="moveToId as string">
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="c in otherColumns" :key="c.id" :value="c.id">
            {{ c.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" :disabled="tasksInColumn.length > 0 && !moveToId" @click="confirmDelete">
          Delete column
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
