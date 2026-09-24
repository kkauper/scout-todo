import { asc, eq } from 'drizzle-orm'
import * as schema from '../db/schema'
import type { Db, Tx } from './owner'

/** First non-hidden column of kind 'open' by position, falling back to the first column overall. */
export async function defaultColumn(db: Db | Tx, userId: string): Promise<typeof schema.boardColumns.$inferSelect> {
  const columns = await db.select().from(schema.boardColumns).where(eq(schema.boardColumns.userId, userId)).orderBy(asc(schema.boardColumns.position))
  const targetColumn = columns.find(c => c.kind === 'open' && !c.hidden) ?? columns[0]
  if (!targetColumn) throw createError({ statusCode: 500, statusMessage: 'No columns exist' })
  return targetColumn
}
