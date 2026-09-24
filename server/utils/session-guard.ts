import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { UserSession } from '#auth-utils'

// Returns true if the session's user still exists and the session version matches
// (i.e. the password hasn't changed since login). Does not throw or clear the session.
export async function isSessionCurrent(event: H3Event, session: UserSession): Promise<boolean> {
  const userId = session.user?.id
  const [row] = userId
    ? await useDb().select({ sv: schema.users.sessionVersion }).from(schema.users).where(eq(schema.users.id, userId))
    : []
  return !!row && session.secure?.sv === row.sv
}

// Rejects sessions whose user no longer exists or whose version is stale (password changed since login).
export async function assertSessionCurrent(event: H3Event, session: UserSession): Promise<void> {
  if (await isSessionCurrent(event, session)) return
  await clearUserSession(event)
  throw createError({ statusCode: 401, statusMessage: 'Session expired' })
}
