import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSyncScheduler } from '../../shared/utils/sync-scheduler'

describe('createSyncScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces two invalidates within the debounce window into one reload', async () => {
    let reloadCount = 0
    let dragging = false
    const scheduler = createSyncScheduler({
      debounceMs: 300,
      isDragging: () => dragging,
      reload: async () => { reloadCount++ },
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    })

    scheduler.scheduleReload()
    vi.advanceTimersByTime(150)
    scheduler.scheduleReload()
    vi.advanceTimersByTime(150)
    // still within debounce window of the second call (300ms since it fired)
    expect(reloadCount).toBe(0)

    await vi.advanceTimersByTimeAsync(150)
    expect(reloadCount).toBe(1)
  })

  it('defers reload while dragging, then runs exactly one reload after drag ends', async () => {
    let reloadCount = 0
    let dragging = true
    const scheduler = createSyncScheduler({
      debounceMs: 300,
      isDragging: () => dragging,
      reload: async () => { reloadCount++ },
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    })

    scheduler.scheduleReload()
    await vi.advanceTimersByTimeAsync(300)
    expect(reloadCount).toBe(0)

    dragging = false
    scheduler.onDraggingChanged(false)
    await vi.advanceTimersByTimeAsync(300)
    expect(reloadCount).toBe(1)

    // ending drag again without a pending reload must not trigger another reload
    scheduler.onDraggingChanged(false)
    await vi.advanceTimersByTimeAsync(300)
    expect(reloadCount).toBe(1)
  })

  it('runs exactly one follow-up reload when an invalidate arrives while a reload is in flight', async () => {
    let reloadCount = 0
    let resolveFirst: (() => void) | undefined
    const dragging = false
    const scheduler = createSyncScheduler({
      debounceMs: 300,
      isDragging: () => dragging,
      reload: () => {
        reloadCount++
        if (reloadCount === 1) {
          return new Promise<void>((resolve) => { resolveFirst = resolve })
        }
        return Promise.resolve()
      },
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    })

    scheduler.scheduleReload()
    await vi.advanceTimersByTimeAsync(300)
    expect(reloadCount).toBe(1)

    // new invalidate while the first reload is still in flight
    scheduler.scheduleReload()
    await vi.advanceTimersByTimeAsync(300)
    // debounced timer fired, but reload is still in flight, so it's queued, not run yet
    expect(reloadCount).toBe(1)

    // finish the in-flight reload; the queued follow-up should run exactly once
    resolveFirst?.()
    await vi.waitFor(() => expect(reloadCount).toBe(2))

    // no further reloads should occur
    await vi.advanceTimersByTimeAsync(300)
    expect(reloadCount).toBe(2)
  })
})
