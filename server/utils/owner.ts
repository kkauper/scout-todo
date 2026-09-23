import { and, eq, inArray, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'

export type Db = ReturnType<typeof useDb>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export async function requireUserId(event: H3Event): Promise<string> {
  const session = await requireUserSession(event)
  if (!session.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Session expired' })
  }
  return session.user.id
}

export async function assertOwnedRefs(
  db: Db | Tx,
  userId: string,
  refs: { projectId?: string | null; columnId?: string; tagIds?: string[] },
  message: string,
): Promise<void> {
  if (refs.projectId !== undefined && refs.projectId !== null) {
    const [row] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, refs.projectId), eq(schema.projects.userId, userId)))
    if (!row) throw createError({ statusCode: 400, statusMessage: message })
  }

  if (refs.columnId !== undefined) {
    const [row] = await db
      .select({ id: schema.boardColumns.id })
      .from(schema.boardColumns)
      .where(and(eq(schema.boardColumns.id, refs.columnId), eq(schema.boardColumns.userId, userId)))
    if (!row) throw createError({ statusCode: 400, statusMessage: message })
  }

  if (refs.tagIds !== undefined) {
    const dedupedIds = [...new Set(refs.tagIds)]
    if (dedupedIds.length > 0) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.tags)
        .where(and(inArray(schema.tags.id, dedupedIds), eq(schema.tags.userId, userId)))
      if ((row?.count ?? 0) !== dedupedIds.length) {
        throw createError({ statusCode: 400, statusMessage: message })
      }
    }
  }
}
