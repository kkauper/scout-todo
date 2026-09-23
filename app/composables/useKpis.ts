import { computed, watch } from 'vue'
import type { KpiReport } from '#shared/utils/kpi'
import { useBoardStore } from '../stores/board'

export function useKpis() {
  const store = useBoardStore()
  const query = computed(() => (store.projectFilter === null ? {} : { projectId: store.projectFilter }))
  const { data, status, error, refresh } = useFetch<KpiReport>('/api/kpis', { query, key: 'kpis' })
  watch(() => store.revision, () => refresh())
  return { report: data, status, error, refresh }
}
