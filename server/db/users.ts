import { eq, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { DEFAULT_COLUMNS } from '../../shared/types/domain'
import { isUniqueViolation } from '../utils/db'
import { createPasswordHash } from '../utils/password'
import * as schema from './schema'

type Db = PostgresJsDatabase<typeof schema>

export const USERNAME_RE = /^[a-z0-9._-]{1,64}$/
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 1000

export function normalizeUsername(raw: string): string {
  const name = raw.trim().toLowerCase()
  if (!USERNAME_RE.test(name)) throw new Error('Invalid username')
  return name
}

export function validatePassword(pw: string): void {
  if (pw.length < PASSWORD_MIN || pw.length > PASSWORD_MAX) {
    throw new Error(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`)
  }
}

export async function createUser(db: Db, username: string, password: string): Promise<{ id: string; username: string }> {
  const name = normalizeUsername(username)
  validatePassword(password)

  try {
    return await db.transaction(async (tx) => {
      const passwordHash = await createPasswordHash(password)
      const [user] = await tx.insert(schema.users).values({ username: name, passwordHash }).returning()
      if (!user) throw new Error('Insert failed')

      await tx.insert(schema.boardColumns).values(
        DEFAULT_COLUMNS.map((c, i) => ({ userId: user.id, name: c.name, kind: c.kind, position: (i + 1) * 1000 })),
      )

      return { id: user.id, username: user.username }
    })
  }
  catch (e) {
    if (isUniqueViolation(e)) throw new Error(`User "${name}" already exists`)
    throw e
  }
}

export async function setUserPassword(db: Db, username: string, password: string): Promise<void> {
  const name = normalizeUsername(username)
  validatePassword(password)

  const passwordHash = await createPasswordHash(password)
  const [row] = await db
    .update(schema.users)
    .set({ passwordHash, sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.username, name))
    .returning()
  if (!row) throw new Error(`User "${name}" not found`)
}
