<script setup lang="ts">
import { ref } from 'vue'
import { Eye } from '@lucide/vue'
import { COLUMN_KIND_LABELS, COLUMN_KINDS } from '#shared/types/domain'
import type { ColumnKind } from '#shared/types/domain'
import { useBoardStore } from '../../stores/board'
import { useTaskPanel } from '../../composables/useTaskPanel'

const store = useBoardStore()
const { taskId } = useTaskPanel()

const addingColumn = ref(false)
const newColumnName = ref('')
const newColumnKind = ref<ColumnKind>('open')

function openAddColumn() {
  addingColumn.value = true
}

function cancelAddColumn() {
  addingColumn.value = false
  newColumnName.value = ''
  newColumnKind.value = 'open'
}

async function submitAddColumn() {
  const name = newColumnName.value.trim()
  if (!name) return
  await store.createColumn(name, newColumnKind.value)
  cancelAddColumn()
}
</script>

<template>
  <div class="flex h-full flex-col">
    <ColumnTabs />
    <div
      data-board-scroller
      class="flex min-h-0 flex-1 items-stretch gap-4 overflow-x-auto overflow-y-hidden p-4 max-md:snap-x max-md:snap-mandatory max-md:gap-3 max-md:scroll-px-4"
      :class="{ 'md:scroll-pe-[28rem] lg:scroll-pe-[32rem]': !!taskId }"
    >
      <BoardColumn v-for="c in store.visibleColumns" :key="c.id" :column="c" />

      <div class="flex w-72 shrink-0 flex-col gap-2 max-md:w-[calc(100vw-2rem)] max-md:snap-center">
        <Button
          v-if="!addingColumn"
          variant="ghost"
          class="justify-start text-muted-foreground"
          @click="openAddColumn"
        >
          + Add column
        </Button>
        <div v-else class="flex flex-col gap-2 rounded-xl bg-muted/50 p-3">
          <Input
            v-model="newColumnName"
            autofocus
            placeholder="Column name…"
            aria-label="New column name"
            @keydown.enter="submitAddColumn"
            @keydown.escape="cancelAddColumn"
          />
          <Select v-model="newColumnKind">
            <SelectTrigger class="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="k in COLUMN_KINDS" :key="k" :value="k">
                {{ COLUMN_KIND_LABELS[k] }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p class="text-xs text-muted-foreground">
            Open = not started, Active = counts as WIP, Done = sets completion date
          </p>
          <div class="flex gap-2">
            <Button size="sm" @click="submitAddColumn">
              Add
            </Button>
            <Button size="sm" variant="outline" @click="cancelAddColumn">
              Cancel
            </Button>
          </div>
        </div>

        <DropdownMenu v-if="store.hiddenColumns.length">
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm">
              Hidden columns ({{ store.hiddenColumns.length }})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              v-for="c in store.hiddenColumns"
              :key="c.id"
              @click="store.updateColumn(c.id, { hidden: false })"
            >
              <Eye />
              {{ c.name }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </div>
</template>
