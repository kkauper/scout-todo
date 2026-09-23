import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { UserSession } from '#auth-utils'

// Rejects sessions whose user no longer exists or whose version is stale (password changed since login).
export async function assertSessionCurrent(event: H3Event, session: UserSession): Promise<void> {
  const userId = session.user?.id
  const [row] = userId
    ? await useDb().select({ sv: schema.users.sessionVersion }).from(schema.users).where(eq(schema.users.id, userId))
    : []
  if (!row || session.secure?.sv !== row.sv) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Session expired' })
  }
}
