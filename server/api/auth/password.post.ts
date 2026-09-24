import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { PASSWORD_MIN, PASSWORD_MAX } from '../../db/users'

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(1000),
  newPassword: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)

  const userId = await requireUserId(event)
  await enforceRateLimit(event, 'LOGIN_LIMITER', `pw:${userId}`, 'Too many login attempts. Try again in a minute.')

  const db = useDb()
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId))
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Session expired' })
  }

  if (!(await verifyCredentials(user, body.currentPassword))) {
    throw createError({ statusCode: 400, statusMessage: 'Current password is incorrect' })
  }

  const passwordHash = await createPasswordHash(body.newPassword)
  const [updated] = await db
    .update(schema.users)
    .set({ passwordHash, sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.id, userId))
    .returning({ sv: schema.users.sessionVersion })

  // Signs out every other device; this one gets a fresh session on the new version.
  await replaceUserSession(event, {
    user: { id: user.id, name: user.username },
    secure: { sv: updated!.sv },
    loggedInAt: Date.now(),
  })

  return { ok: true }
})
