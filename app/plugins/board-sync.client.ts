import { watch } from 'vue'
import { useBoardStore } from '../stores/board'
import { createSyncScheduler } from '../../shared/utils/sync-scheduler'

const VISIBILITY_THROTTLE_MS = 5000
const DEBOUNCE_MS = 300

export default defineNuxtPlugin(() => {
  const store = useBoardStore()
  const dragging = useState('boardDragging', () => false)

  const tabId = crypto.randomUUID()
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('scout-board') : null

  // Outgoing: tell other tabs a mutation happened here.
  watch(() => store.revision, () => {
    channel?.postMessage({ type: 'invalidate', origin: tabId })
  })

  async function reload() {
    try {
      await store.load()
    }
    catch {
      // ignore network errors; next event/visibility retries
    }
  }

  const scheduler = createSyncScheduler({
    debounceMs: DEBOUNCE_MS,
    isDragging: () => dragging.value,
    reload,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  })

  function scheduleReload() {
    // Never load on the login page — would redirect-loop.
    if (!store.loaded) return
    scheduler.scheduleReload()
  }

  watch(dragging, (d) => {
    scheduler.onDraggingChanged(d)
  })

  // Incoming: another tab mutated the board.
  if (channel) {
    channel.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'invalidate' && e.data.origin !== tabId) scheduleReload()
    }
  }

  // Refetch when the tab becomes visible again, throttled.
  let lastVisibilityReload = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    const now = Date.now()
    if (now - lastVisibilityReload <= VISIBILITY_THROTTLE_MS) return
    lastVisibilityReload = now
    scheduleReload()
  })
})
