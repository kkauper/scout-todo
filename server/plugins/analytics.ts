import type { TaskMovedPayload } from '../types/hooks'

export default defineNitroPlugin((nitroApp) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(nitroApp.hooks as any).hook('scout:task-moved', (payload: TaskMovedPayload) => {
    if (import.meta.dev) {
      console.log('[analytics] task-moved', payload)
    }
  })
})
