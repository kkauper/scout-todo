<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TaskSize } from '#shared/types/domain'
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
  size: null as TaskSize | null,
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
const showMore = computed(() => moreOpen.value)

function defaultCreateColumnId(): string | null {
  if (dialog.value.columnId) return dialog.value.columnId
  const openColumn = store.visibleColumns.find((c) => c.kind === 'open')
  if (openColumn) return openColumn.id
  return store.visibleColumns[0]?.id ?? null
}

watch(() => dialog.value.open, (isOpen) => {
  if (!isOpen) return

  moreOpen.value = false
  draftChecklist.value = []

  const projectId = store.projectFilter && store.projectFilter !== 'none' ? store.projectFilter : null
  form.value = {
    title: dialog.value.title,
    description: null,
    projectId,
    deadline: null,
    size: null,
    tagIds: [],
    columnId: defaultCreateColumnId(),
  }
})

async function onAddSuggested(titles: string[]) {
  if (!titles.length) return
  draftChecklist.value.push(...titles)
}

const subtaskAi = ref<InstanceType<typeof AiSubtaskSuggestions> | null>(null)

async function save() {
  const title = form.value.title.trim()
  if (!title) return

  const result = await store.createTask({
    title,
    columnId: form.value.columnId ?? undefined,
    projectId: form.value.projectId,
    description: form.value.description,
    deadline: form.value.deadline,
    size: form.value.size,
    tagIds: form.value.tagIds,
  })
  if (result) {
    if (draftChecklist.value.length > 0) {
      await store.addChecklistItems(result.id, draftChecklist.value)
    }
    close()
  }
}
</script>

<template>
  <Dialog v-model:open="dialog.open">
    <DialogContent class="sm:max-w-xl max-h-[85vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>New task</DialogTitle>
        <DialogDescription class="sr-only">
          Create a new task
        </DialogDescription>
      </DialogHeader>
      <form class="flex flex-1 flex-col min-h-0" @submit.prevent="save">
        <div class="flex-1 overflow-y-auto min-h-0 space-y-4">
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <Label for="task-title">Title</Label>
              <AiTitleSuggestions :title="form.title" :description="form.description" :project-name="projectName" @pick="(t) => (form.title = t)" />
            </div>
            <Input id="task-title" v-model="form.title" required autofocus maxlength="200" />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <ProjectPicker v-model="form.projectId" />
            <SizePicker v-model="form.size" />
            <DeadlinePicker v-if="showMore" v-model="form.deadline" />
            <Select v-model="form.columnId as string">
              <SelectTrigger class="w-40" aria-label="Column">
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
            :task-id="null"
            v-model:draft="draftChecklist"
          >
            <template v-if="showMore" #actions>
              <AiButton label="Suggest sub-todos" :loading="subtaskAi?.loading ?? false" @click="subtaskAi?.run()" />
            </template>
          </ChecklistEditor>
          <AiSubtaskSuggestions v-if="showMore" ref="subtaskAi" :title="form.title" :description="form.description" @add="onAddSuggested" />
        </div>

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
