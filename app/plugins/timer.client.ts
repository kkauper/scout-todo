import { watch } from 'vue'
import { TIMER_HEARTBEAT_MS } from '#shared/types/domain'
import { useBoardStore } from '../stores/board'
import { useLiveAnnouncer } from '../composables/useLiveAnnouncer'

export default defineNuxtPlugin(() => {
  const store = useBoardStore()
  const { announce } = useLiveAnnouncer()
  const now = useState('timerNow', () => Date.now())

  let tickHandle: ReturnType<typeof setInterval> | undefined
  let heartbeatHandle: ReturnType<typeof setInterval> | undefined

  watch(
    () => store.runningTimer,
    (running) => {
      if (running) {
        if (!tickHandle) tickHandle = setInterval(() => { now.value = Date.now() }, 1000)
        if (!heartbeatHandle) heartbeatHandle = setInterval(() => { store.heartbeat() }, TIMER_HEARTBEAT_MS)
      }
      else {
        if (tickHandle) { clearInterval(tickHandle); tickHandle = undefined }
        if (heartbeatHandle) { clearInterval(heartbeatHandle); heartbeatHandle = undefined }
      }
    },
    { immediate: true },
  )

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store.runningTimer) store.heartbeat()
  })

  window.addEventListener('online', () => {
    if (store.runningTimer) store.heartbeat()
  })

  watch(() => store.timerNotice, (notice) => {
    if (notice) announce(notice)
  })
})
