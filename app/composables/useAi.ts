import { computed } from 'vue'

interface AiStatus {
  provider: 'claude' | 'ollama'
  available: boolean
  model: string
  modelInstalled: boolean
}

export function useAi() {
  const status = useState<AiStatus | null>('aiStatus', () => null)

  async function refreshStatus() {
    try {
      status.value = await $fetch<AiStatus>('/api/ai/status')
    }
    catch {
      status.value = { provider: 'ollama', available: false, model: '', modelInstalled: false }
    }
  }

  const ready = computed(() => !!status.value?.available && !!status.value?.modelInstalled)

  const reason = computed(() => {
    if (!status.value) return 'Checking local AI…'
    if (!status.value.available) return 'Local AI offline — start Ollama or add a Claude API key in Account → AI settings'
    if (!status.value.modelInstalled) return `Model ${status.value.model} not installed — run: ollama pull ${status.value.model}`
    return ''
  })

  async function improveTitle(input: { title: string; description?: string | null; projectName?: string | null }) {
    return $fetch<{ suggestions: string[] }>('/api/ai/improve-title', { method: 'POST', body: input })
  }

  async function draftDescription(input: { title: string; projectName?: string | null; tags?: string[]; existing?: string | null }) {
    return $fetch<{ text: string }>('/api/ai/draft-description', { method: 'POST', body: input })
  }

  async function suggestSubtasks(input: { title: string; description?: string | null }) {
    return $fetch<{ items: string[] }>('/api/ai/suggest-subtasks', { method: 'POST', body: input })
  }

  async function achievementSummary(input: { from: string; to: string; projectId?: string | null; periodLabel: string }) {
    return $fetch<{ text: string; count: number }>('/api/ai/achievement-summary', { method: 'POST', body: input })
  }

  return {
    status,
    ready,
    reason,
    refreshStatus,
    improveTitle,
    draftDescription,
    suggestSubtasks,
    achievementSummary,
  }
}
