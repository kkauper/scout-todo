import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

declare module 'h3' {
  interface H3EventContext {
    scoutDb?: ReturnType<typeof drizzle<typeof schema>>
    scoutPg?: ReturnType<typeof postgres>
  }
}

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined

export function useDb() {
  let event: ReturnType<typeof useEvent> | undefined
  try {
    event = useEvent()
  }
  catch {
    event = undefined
  }

  const connectionString = event?.context.cloudflare?.env?.HYPERDRIVE?.connectionString
  if (connectionString) {
    if (event!.context.scoutDb) return event!.context.scoutDb
    const client = postgres(connectionString, { max: 5, fetch_types: false })
    event!.context.scoutPg = client
    event!.context.scoutDb = drizzle(client, { schema })
    return event!.context.scoutDb
  }

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
