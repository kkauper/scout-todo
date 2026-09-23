<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  weekly: { weekStart: string; count: number }[]
}>()

const max = computed(() => Math.max(1, ...props.weekly.map(w => w.count)))

function heightPct(count: number): number {
  return Math.max((count / max.value) * 100, 4)
}

function barLabel(w: { weekStart: string; count: number }): string {
  return `Week of ${w.weekStart}: ${w.count} done`
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
              :style="{ height: `${heightPct(w.count)}%` }"
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
