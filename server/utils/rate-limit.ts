import { createError } from 'h3'
import type { H3Event } from 'h3'

type Limiter = { limit(o: { key: string }): Promise<{ success: boolean }> }

// Cloudflare rate-limit bindings from wrangler.jsonc; absent in local dev, where limits are skipped.
export async function enforceRateLimit(
  event: H3Event,
  binding: 'LOGIN_LIMITER' | 'AI_LIMITER',
  key: string,
  message: string,
): Promise<void> {
  const limiter = (event.context.cloudflare?.env as Record<string, Limiter | undefined> | undefined)?.[binding]
  if (!limiter) return
  const { success } = await limiter.limit({ key })
  if (!success) throw createError({ statusCode: 429, statusMessage: message })
}
