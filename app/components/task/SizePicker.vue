<script setup lang="ts">
import { computed } from 'vue'
import type { TaskSize } from '#shared/types/domain'
import { TASK_SIZE_HINTS, TASK_SIZE_LABELS, TASK_SIZES } from '#shared/types/domain'

const model = defineModel<TaskSize | null>()

const selectValue = computed<string>({
  get: () => model.value ?? '__none',
  set: (value) => { model.value = value === '__none' ? null : (value as TaskSize) },
})

const triggerLabel = computed(() => (model.value ? TASK_SIZE_LABELS[model.value] : 'Size'))
const triggerAriaLabel = computed(() => `Size: ${model.value ? TASK_SIZE_LABELS[model.value] : 'none'}`)
</script>

<template>
  <Select v-model="selectValue">
    <SelectTrigger size="sm" class="w-auto" :aria-label="triggerAriaLabel">
      <SelectValue>{{ triggerLabel }}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="__none">
        No size
      </SelectItem>
      <SelectItem v-for="s in TASK_SIZES" :key="s" :value="s">
        {{ TASK_SIZE_LABELS[s] }} — {{ TASK_SIZE_HINTS[s] }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
