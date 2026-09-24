<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarDays } from '@lucide/vue'
import type { DateValue } from '@internationalized/date'
import { parseDate } from '@internationalized/date'

const model = defineModel<string | null>({ required: true })

const open = ref(false)

const calendarValue = computed<DateValue | undefined>(() => (model.value ? parseDate(model.value) : undefined))

function onUpdate(d: DateValue | undefined) {
  model.value = d ? d.toString() : null
  open.value = false
}

function clear() {
  model.value = null
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm" :aria-label="`Deadline: ${model ?? 'No deadline'}`">
        <CalendarDays />
        {{ model ?? 'No deadline' }}
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-0">
      <Calendar
        :model-value="calendarValue"
        initial-focus
        @update:model-value="onUpdate"
      />
      <Button v-if="model" variant="ghost" class="w-full" @click="clear">
        Clear
      </Button>
    </PopoverContent>
  </Popover>
</template>
