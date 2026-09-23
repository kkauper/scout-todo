<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { COLUMN_KIND_LABELS } from '#shared/types/domain'
import type { StateEvent } from '#shared/types/domain'
import { useBoardStore } from '../../stores/board'
import { useTaskDialog } from '../../composables/useTaskDialog'
import AiTitleSuggestions from '../ai/AiTitleSuggestions.vue'
import AiDescriptionButton from '../ai/AiDescriptionButton.vue'
import AiSubtaskSuggestions from '../ai/AiSubtaskSuggestions.vue'

const store = useBoardStore()
const { dialog, close } = useTaskDialog()

const form = ref({
  title: '',
  description: null as string | null,
  projectId: null as string | null,
  deadline: null as string | null,
  tagIds: [] as string[],
  columnId: null as string | null,
})

const draftChecklist = ref<string[]>([])

const projectName = computed(() => (form.value.projectId ? store.projectById.get(form.value.projectId)?.name ?? null : null))
const tagNames = computed(() => form.value.tagIds.map((id) => store.tagById.get(id)?.name).filter((n): n is string => !!n))

const description = computed<string>({
  get: () => form.value.description ?? '',
  set: (value) => { form.value.description = value === '' ? null : value },
})

const moreOpen = ref(false)
const events = ref<StateEvent[]>([])

const currentTask = computed(() => (dialog.value.taskId ? store.tasks.find((t) => t.id === dialog.value.taskId) ?? null : null))
const showMore = computed(() => dialog.value.mode === 'edit' || moreOpen.value)

function defaultCreateColumnId(): string | null {
  if (dialog.value.columnId) return dialog.value.columnId
  const openColumn = store.visibleColumns.find((c) => c.kind === 'open')
  if (openColumn) return openColumn.id
  return store.visibleColumns[0]?.id ?? null
}

function fromLabel(e: StateEvent): string {
  return e.fromColumnId ? (store.columnById.get(e.fromColumnId)?.name ?? 'created') : 'created'
}

function toLabel(e: StateEvent): string {
  if (e.toColumnId) return store.columnById.get(e.toColumnId)?.name ?? 'deleted column'
  return `deleted column (${COLUMN_KIND_LABELS[e.toKind]})`
}

watch(() => dialog.value.open, (isOpen) => {
  if (!isOpen) return

  moreOpen.value = false
  events.value = []
  draftChecklist.value = []

  if (dialog.value.mode === 'edit') {
    const task = currentTask.value
    if (task) {
      form.value = {
        title: task.title,
        description: task.description,
        projectId: task.projectId,
        deadline: task.deadline,
        tagIds: [...task.tagIds],
        columnId: task.columnId,
      }
      store.fetchEvents(task.id).then((result) => { events.value = result })
    }
  }
  else {
    const projectId = store.projectFilter && store.projectFilter !== 'none' ? store.projectFilter : null
    form.value = {
      title: dialog.value.title,
      description: null,
      projectId,
      deadline: null,
      tagIds: [],
      columnId: defaultCreateColumnId(),
    }
  }
})

async function onAddSuggested(titles: string[]) {
  if (!titles.length) return
  if (dialog.value.mode === 'edit' && dialog.value.taskId) await store.addChecklistItems(dialog.value.taskId, titles)
  else draftChecklist.value.push(...titles)
}

async function save() {
  const title = form.value.title.trim()
  if (!title) return

  if (dialog.value.mode === 'create') {
    const result = await store.createTask({
      title,
      columnId: form.value.columnId ?? undefined,
      projectId: form.value.projectId,
      description: form.value.description,
      deadline: form.value.deadline,
      tagIds: form.value.tagIds,
    })
    if (result) {
      if (draftChecklist.value.length > 0) {
        await store.addChecklistItems(result.id, draftChecklist.value)
      }
      close()
    }
  }
  else if (dialog.value.taskId) {
    await store.updateTask(dialog.value.taskId, {
      title,
      description: form.value.description,
      projectId: form.value.projectId,
      deadline: form.value.deadline,
      tagIds: form.value.tagIds,
    })
    close()
  }
}
</script>

<template>
  <Dialog v-model:open="dialog.open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ dialog.mode === 'create' ? 'New task' : 'Edit task' }}</DialogTitle>
        <DialogDescription class="sr-only">
          {{ dialog.mode === 'create' ? 'Create a new task' : 'Update the task details' }}
        </DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="save">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <Label for="task-title">Title</Label>
            <AiTitleSuggestions :title="form.title" :description="form.description" :project-name="projectName" @pick="(t) => (form.title = t)" />
          </div>
          <Input id="task-title" v-model="form.title" required autofocus maxlength="200" />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <ProjectPicker v-model="form.projectId" />
          <DeadlinePicker v-if="showMore" v-model="form.deadline" />
          <Select v-if="dialog.mode === 'create'" v-model="form.columnId as string">
            <SelectTrigger class="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="c in store.visibleColumns" :key="c.id" :value="c.id">
                {{ c.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <TagPicker v-if="showMore" v-model="form.tagIds" />
        <Button
          v-if="dialog.mode === 'create'"
          type="button"
          variant="ghost"
          size="sm"
          :aria-expanded="moreOpen"
          @click="moreOpen = !moreOpen"
        >
          More details
        </Button>
        <div v-if="showMore" class="space-y-1.5">
          <div class="flex items-center justify-between">
            <Label for="task-description">Description</Label>
            <AiDescriptionButton :title="form.title" :project-name="projectName" :tags="tagNames" :existing="form.description" @result="(t) => (form.description = t)" />
          </div>
          <Textarea id="task-description" v-model="description" rows="4" />
        </div>

        <ChecklistEditor
          v-if="showMore"
          :task-id="dialog.mode === 'edit' ? dialog.taskId : null"
          v-model:draft="draftChecklist"
        />
        <AiSubtaskSuggestions v-if="showMore" :title="form.title" :description="form.description" @add="onAddSuggested" />

        <template v-if="dialog.mode === 'edit' && currentTask">
          <Separator />
          <div class="space-y-2">
            <h3 class="text-sm font-medium">
              History
            </h3>
            <dl class="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <dt>Created</dt>
              <dd>{{ new Date(currentTask.createdAt).toLocaleString() }}</dd>
              <dt>Last state change</dt>
              <dd>{{ new Date(currentTask.stateChangedAt).toLocaleString() }}</dd>
              <template v-if="currentTask.completedAt">
                <dt>Completed</dt>
                <dd>{{ new Date(currentTask.completedAt).toLocaleString() }}</dd>
              </template>
            </dl>
            <ul class="space-y-1 text-xs text-muted-foreground">
              <li v-for="(e, i) in events" :key="i">
                {{ fromLabel(e) }} → {{ toLabel(e) }} · {{ new Date(e.changedAt).toLocaleString() }}
              </li>
            </ul>
          </div>
        </template>

        <DialogFooter>
          <Button type="button" variant="outline" @click="close">
            Cancel
          </Button>
          <Button type="submit" :disabled="!form.title.trim()">
            Save
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
