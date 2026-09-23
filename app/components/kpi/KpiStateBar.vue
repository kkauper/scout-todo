<script setup lang="ts">
import type { KpiReport } from '#shared/utils/kpi'

const props = defineProps<{
  byColumn: KpiReport['counts']['byColumn']
  total: number
}>()

function pct(count: number): number {
  return props.total ? (count / props.total) * 100 : 0
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-for="col in byColumn" :key="col.columnId" class="flex flex-col gap-1">
      <div class="flex items-center justify-between text-xs">
        <span>
          {{ col.name }}
          <span v-if="col.hidden" class="text-muted-foreground">(hidden)</span>
        </span>
        <span class="tabular-nums">{{ col.count }}</span>
      </div>
      <Progress
        :model-value="pct(col.count)"
        class="h-1.5"
        :aria-label="`${col.name}: ${col.count} of ${total}`"
      />
    </div>
  </div>
</template>
