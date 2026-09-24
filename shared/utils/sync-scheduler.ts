// Pure, injectable state machine for cross-tab board sync (see app/plugins/board-sync.client.ts).
// Relative imports only, no Nuxt auto-imports, so this runs under plain Vitest.

export interface SyncSchedulerOptions {
  /** Debounce delay in ms before a scheduled reload actually runs. */
  debounceMs: number
  /** Returns whether a drag is currently in progress. */
  isDragging: () => boolean
  /** Performs the actual reload; may reject (e.g. network error). */
  reload: () => Promise<void>
  /** Schedules `fn` to run after `ms` milliseconds, returns a timer handle. Injectable for tests. */
  setTimer: (fn: () => void, ms: number) => unknown
  /** Clears a timer handle returned by `setTimer`. */
  clearTimer: (handle: unknown) => void
}

export interface SyncScheduler {
  /** Call when an invalidate event (own mutation or remote message) occurs. Debounced. */
  scheduleReload: () => void
  /** Call whenever the drag flag changes; resumes a pending reload once dragging ends. */
  onDraggingChanged: (dragging: boolean) => void
}

/**
 * Creates a debounced reload scheduler that:
 * - coalesces bursts of `scheduleReload()` calls within `debounceMs` into a single reload
 * - defers the reload while dragging is in progress, running it once exactly after drag ends
 * - guards against overlapping reloads: if a reload is in flight when another is requested,
 *   runs exactly one follow-up reload after the in-flight one finishes
 */
export function createSyncScheduler(options: SyncSchedulerOptions): SyncScheduler {
  const { debounceMs, isDragging, reload, setTimer, clearTimer } = options

  let debounceTimer: unknown = null
  let pendingAfterDrag = false
  let loadInFlight = false
  let againAfterLoad = false

  function runReload() {
    if (loadInFlight) {
      againAfterLoad = true
      return
    }
    loadInFlight = true
    reload()
      .catch(() => { /* ignore network errors; next event/visibility retries */ })
      .finally(() => {
        loadInFlight = false
        if (againAfterLoad) {
          againAfterLoad = false
          runReload()
        }
      })
  }

  function fireDebounced() {
    debounceTimer = null
    if (isDragging()) {
      pendingAfterDrag = true
      return
    }
    runReload()
  }

  function scheduleReload() {
    if (debounceTimer !== null) clearTimer(debounceTimer)
    debounceTimer = setTimer(fireDebounced, debounceMs)
  }

  function onDraggingChanged(dragging: boolean) {
    if (!dragging && pendingAfterDrag) {
      pendingAfterDrag = false
      scheduleReload()
    }
  }

  return { scheduleReload, onDraggingChanged }
}
