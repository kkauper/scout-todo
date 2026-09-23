import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(1000),
  newPassword: z.string().min(8).max(1000),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)

  const limiter = (event.context.cloudflare?.env as { LOGIN_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> } } | undefined)?.LOGIN_LIMITER
  const userId = await requireUserId(event)
  if (limiter) {
    const key = `pw:${userId}`
    const { success } = await limiter.limit({ key })
    if (!success) {
      throw createError({ statusCode: 429, statusMessage: 'Too many login attempts. Try again in a minute.' })
    }
  }

  const db = useDb()
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId))
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Session expired' })
  }

  if (!(await verifyCredentials(user, body.currentPassword))) {
    throw createError({ statusCode: 400, statusMessage: 'Current password is incorrect' })
  }

  const passwordHash = await createPasswordHash(body.newPassword)
  await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, userId))

  return { ok: true }
})
