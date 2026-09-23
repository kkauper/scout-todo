<script setup lang="ts">
import { computed, ref } from 'vue'
import { ClipboardCopyIcon } from '@lucide/vue'
import { formatKpiSummary } from '#shared/utils/kpi-summary'
import { useBoardStore } from '../../stores/board'
import { useKpis } from '../../composables/useKpis'
import AchievementSummary from '../ai/AchievementSummary.vue'

const store = useBoardStore()
const { report, status } = useKpis()

const scopeName = computed(() => {
  const filter = store.projectFilter
  if (filter === null) return 'All projects'
  if (filter === 'none') return 'No project'
  return store.projectById.get(filter)?.name ?? 'Unknown project'
})

const copied = ref(false)
let copiedTimeout: ReturnType<typeof setTimeout> | undefined

async function copySummary(): Promise<void> {
  if (!report.value) return
  await navigator.clipboard.writeText(formatKpiSummary(report.value, scopeName.value))
  copied.value = true
  if (copiedTimeout) clearTimeout(copiedTimeout)
  copiedTimeout = setTimeout(() => {
    copied.value = false
  }, 2000)
}

function fmtOptionalDays(value: number | null): string {
  return value === null ? '—' : `${value} d`
}
</script>

<template>
  <div class="flex flex-col gap-6 p-6">
    <div class="flex items-start justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold">
          KPIs
        </h2>
        <div class="text-xs text-muted-foreground">
          {{ scopeName }}
        </div>
      </div>
      <Button
        v-if="report"
        variant="ghost"
        size="sm"
        aria-live="polite"
        @click="copySummary"
      >
        <ClipboardCopyIcon />
        {{ copied ? 'Copied' : 'Copy summary' }}
      </Button>
    </div>

    <div v-if="status === 'pending' && !report" class="flex flex-col gap-2">
      <div class="h-16 animate-pulse rounded-md bg-muted" />
      <div class="h-16 animate-pulse rounded-md bg-muted" />
      <div class="h-16 animate-pulse rounded-md bg-muted" />
    </div>

    <template v-else-if="report">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiStat label="Open" :value="report.counts.open" />
        <KpiStat label="WIP" :value="report.counts.wip" />
        <KpiStat label="Done" :value="report.counts.done" />
        <KpiStat label="Overdue" :value="report.overdue" tone="destructive" />
      </div>

      <Separator />

      <div class="grid gap-6 md:grid-cols-2">
        <div class="flex flex-col gap-6">
          <div class="flex flex-col gap-2">
            <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              By column
            </h3>
            <KpiStateBar :by-column="report.counts.byColumn" :total="report.counts.total" />
          </div>

          <div class="flex flex-col gap-2">
            <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Aging
            </h3>
            <p v-if="!report.aging.oldest.length" class="text-xs text-muted-foreground">
              Nothing waiting.
            </p>
            <ol v-else class="flex flex-col gap-1">
              <li
                v-for="item in report.aging.oldest"
                :key="item.taskId"
                class="flex items-center justify-between gap-2 text-xs"
              >
                <span class="truncate">{{ item.title }}</span>
                <span class="shrink-0 text-muted-foreground">{{ item.columnName }} · {{ item.days }} d</span>
              </li>
            </ol>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Flow
          </h3>
          <div class="grid grid-cols-2 gap-2">
            <KpiStat
              label="Cycle time"
              :value="fmtOptionalDays(report.cycleTime.avgDays)"
              :hint="report.cycleTime.avgDays === null ? undefined : `median ${report.cycleTime.medianDays} d · n=${report.cycleTime.sample}`"
            />
            <KpiStat
              label="WIP age"
              :value="fmtOptionalDays(report.aging.wipAvgDays)"
              hint="avg days in current state"
            />
          </div>
          <div class="text-xs text-muted-foreground">
            {{ report.throughput.thisMonth }} this month · {{ report.throughput.last30Days }} last 30 d
          </div>
          <ThroughputBars :weekly="report.throughput.weekly" />
        </div>
      </div>

      <template v-if="report.projects.length">
        <Separator />
        <div class="flex flex-col gap-2">
          <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Projects
          </h3>
          <ProjectBreakdown :rows="report.projects" />
        </div>
      </template>
    </template>

    <Separator />
    <AchievementSummary />
  </div>
</template>
