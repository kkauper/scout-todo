import { computed, watch } from 'vue'
import { useBoardStore } from '../stores/board'

// Only active inside the Scout desktop app (Tauri). No-op in browsers.
export default defineNuxtPlugin(async () => {
  if (!('__TAURI_INTERNALS__' in window)) return

  const [{ invoke }, { listen }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')])

  const store = useBoardStore()

  const key = computed<string | null>(() => {
    const running = store.runningTimer
    if (!running) return null
    const taskTitle = store.tasks.find((t) => t.id === running.taskId)?.title ?? 'Timer'
    const startedAtMs = Date.parse(running.startedAt)
    return JSON.stringify({ taskTitle, startedAtMs })
  })

  watch(key, (k) => {
    invoke('timer_changed', { timer: k ? JSON.parse(k) : null }).catch(() => {})
  }, { immediate: true })

  try {
    await listen('tray-stop-timer', () => {
      if (store.runningTimer) store.stopTimer()
    })
  }
  catch {
    // ignore: a permission problem here should never break the web app
  }
})
