<script setup lang="ts">
import { COLUMN_KIND_LABELS, COLUMN_KINDS } from '#shared/types/domain'
import type { ColumnKind } from '#shared/types/domain'
import type { KpiReport } from '#shared/utils/kpi'
import { useBoardStore } from '../../stores/board'

defineProps<{
  rows: KpiReport['projects']
}>()

const store = useBoardStore()

const KIND_SEGMENT_CLASS: Record<ColumnKind, string> = {
  open: 'bg-muted-foreground/40',
  active: 'bg-[var(--swatch-blue)]',
  done: 'bg-[var(--swatch-green)]',
}

function segmentWidth(count: number, total: number): number {
  return total ? (count / total) * 100 : 0
}

function barAriaLabel(byKind: Record<ColumnKind, number>): string {
  return COLUMN_KINDS.map((k) => `${COLUMN_KIND_LABELS[k]}: ${byKind[k]}`).join(', ')
}

function selectProject(projectId: string | null): void {
  store.projectFilter = projectId ?? 'none'
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <button
      v-for="row in rows"
      :key="row.projectId ?? 'none'"
      type="button"
      class="w-full rounded-md p-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      :aria-label="`Filter board by ${row.name} (${row.total} tasks)`"
      @click="selectProject(row.projectId)"
    >
      <div class="flex items-center justify-between gap-2">
        <ProjectBadge :label="row.name" :color="row.color" />
        <span class="text-xs tabular-nums text-muted-foreground">{{ row.total }}</span>
      </div>
      <div
        role="img"
        class="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted"
        :aria-label="barAriaLabel(row.byKind)"
      >
        <div
          v-for="kind in COLUMN_KINDS"
          :key="kind"
          :class="KIND_SEGMENT_CLASS[kind]"
          :style="{ width: `${segmentWidth(row.byKind[kind], row.total)}%` }"
        />
      </div>
    </button>
  </div>
</template>
