<script setup lang="ts">
import { ref } from 'vue'
import { localDateIso } from '#shared/utils/dates'
import { useAi } from '../../composables/useAi'
import { useBoardStore } from '../../stores/board'

type PeriodKey = 'this_week' | 'last_7' | 'this_month' | 'last_30' | 'last_90'

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'this_week', label: 'This week' },
  { key: 'last_7', label: 'Last 7 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_30', label: 'Last 30 days' },
  { key: 'last_90', label: 'Last 90 days' },
]

const store = useBoardStore()
const { achievementSummary } = useAi()
const { announce } = useLiveAnnouncer()

const period = ref<PeriodKey>('last_30')
const loading = ref(false)
const errorText = ref<string | null>(null)
const text = ref('')
const count = ref<number | null>(null)
const copied = ref(false)
let copiedTimeout: ReturnType<typeof setTimeout> | undefined

function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function daysAgo(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - days)
}

function range(key: PeriodKey): { from: string; to: string } {
  const now = new Date()
  const to = localDateIso(now)
  if (key === 'this_week') return { from: localDateIso(startOfWeek(now)), to }
  if (key === 'last_7') return { from: localDateIso(daysAgo(now, 6)), to }
  if (key === 'this_month') return { from: localDateIso(startOfMonth(now)), to }
  if (key === 'last_30') return { from: localDateIso(daysAgo(now, 29)), to }
  return { from: localDateIso(daysAgo(now, 89)), to }
}

function extractErrorMessage(e: unknown): string {
  const err = e as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
  return err?.data?.statusMessage ?? err?.statusMessage ?? err?.message ?? 'Request failed'
}

async function run() {
  loading.value = true
  errorText.value = null
  text.value = ''
  count.value = null

  const { from, to } = range(period.value)
  const periodLabel = PERIODS.find(p => p.key === period.value)?.label ?? 'Period'
  const projectId = store.projectFilter === null ? undefined : store.projectFilter

  announce('Generating suggestions…')
  try {
    const result = await achievementSummary({ from, to, projectId, periodLabel })
    text.value = result.text
    count.value = result.count
    announce(result.count === 0 ? 'No completed tasks in this period' : 'Summary ready')
  }
  catch (e) {
    errorText.value = extractErrorMessage(e)
  }
  finally {
    loading.value = false
  }
}

async function copy() {
  if (!text.value) return
  await navigator.clipboard.writeText(text.value)
  copied.value = true
  if (copiedTimeout) clearTimeout(copiedTimeout)
  copiedTimeout = setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      Achievements
    </h3>

    <div class="flex items-center gap-2">
      <Select v-model="period">
        <SelectTrigger class="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="p in PERIODS" :key="p.key" :value="p.key">
            {{ p.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <AiButton label="Write achievement summary" :loading="loading" @click="run" />
    </div>

    <p v-if="errorText" class="text-xs text-destructive" role="alert">
      {{ errorText }}
    </p>

    <p v-else-if="count === 0" class="text-xs text-muted-foreground">
      No completed tasks in this period.
    </p>

    <template v-else-if="text">
      <Textarea :model-value="text" readonly rows="12" class="font-mono text-xs" />
      <Button variant="ghost" size="sm" @click="copy">
        {{ copied ? 'Copied' : 'Copy' }}
      </Button>
    </template>
  </div>
</template>
