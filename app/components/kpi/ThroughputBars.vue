<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    weekly: { weekStart: string; count: number; weight?: number }[]
    metric?: 'count' | 'weight'
    unit?: string
  }>(),
  { metric: 'count', unit: 'done' },
)

function valueOf(w: { count: number; weight?: number }): number {
  return props.metric === 'weight' ? (w.weight ?? 0) : w.count
}

const max = computed(() => Math.max(1, ...props.weekly.map(valueOf)))

function heightPct(w: { count: number; weight?: number }): number {
  return Math.max((valueOf(w) / max.value) * 100, 4)
}

function barLabel(w: { weekStart: string; count: number; weight?: number }): string {
  return `Week of ${w.weekStart}: ${valueOf(w)} ${props.unit}`
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <TooltipProvider>
      <div class="flex h-20 items-end gap-1">
        <Tooltip v-for="w in weekly" :key="w.weekStart">
          <TooltipTrigger as-child>
            <div
              class="flex-1 rounded-sm bg-primary/80"
              :style="{ height: `${heightPct(w)}%` }"
              role="img"
              :aria-label="barLabel(w)"
            />
          </TooltipTrigger>
          <TooltipContent>
            {{ barLabel(w) }}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
    <div v-if="weekly.length" class="flex justify-between text-[10px] text-muted-foreground">
      <span>{{ weekly[0]?.weekStart }}</span>
      <span>{{ weekly[weekly.length - 1]?.weekStart }}</span>
    </div>
  </div>
</template>
