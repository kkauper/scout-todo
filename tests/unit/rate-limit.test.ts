import { describe, it, expect, vi } from 'vitest'
import { enforceRateLimit } from '../../server/utils/rate-limit'

describe('enforceRateLimit', () => {
  it('resolves when there is no cloudflare context', async () => {
    const event = { context: {} } as any
    await expect(enforceRateLimit(event, 'AI_LIMITER', 'some-key', 'Too many AI requests. Try again in a minute.')).resolves.toBeUndefined()
  })

  it('resolves and calls the limiter with the given key when it allows the request', async () => {
    const limit = vi.fn().mockResolvedValue({ success: true })
    const event = { context: { cloudflare: { env: { AI_LIMITER: { limit } } } } } as any
    await expect(enforceRateLimit(event, 'AI_LIMITER', 'ai:user-1', 'Too many AI requests. Try again in a minute.')).resolves.toBeUndefined()
    expect(limit).toHaveBeenCalledWith({ key: 'ai:user-1' })
  })

  it('rejects with 429 and the given message when the limiter denies the request', async () => {
    const limit = vi.fn().mockResolvedValue({ success: false })
    const event = { context: { cloudflare: { env: { AI_LIMITER: { limit } } } } } as any
    await expect(enforceRateLimit(event, 'AI_LIMITER', 'ai:user-1', 'Too many AI requests. Try again in a minute.')).rejects.toMatchObject({
      statusCode: 429,
      statusMessage: 'Too many AI requests. Try again in a minute.',
    })
  })
})
