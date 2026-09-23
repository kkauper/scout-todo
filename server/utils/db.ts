import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined

export function useDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw createError({ statusCode: 500, statusMessage: 'DATABASE_URL not set' })
    _db = drizzle(postgres(url, { max: 5 }), { schema })
  }
  return _db
}
export { schema }
export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code === '23505' || err?.cause?.code === '23505'
}
export function isForeignKeyViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code === '23503' || err?.cause?.code === '23503'
}
