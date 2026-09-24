import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(1000),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)

  await enforceRateLimit(event, 'LOGIN_LIMITER', getRequestHeader(event, 'cf-connecting-ip') ?? 'unknown', 'Too many login attempts. Try again in a minute.')

  const username = body.username.trim().toLowerCase()
  const [user] = await useDb().select().from(schema.users).where(eq(schema.users.username, username))

  if (!(await verifyCredentials(user, body.password)) || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid username or password' })
  }

  await setUserSession(event, {
    user: { id: user.id, name: user.username },
    secure: { sv: user.sessionVersion },
    loggedInAt: Date.now(),
  })
  return { ok: true }
})
