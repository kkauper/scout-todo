import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { COLUMN_KINDS } from '#shared/types/domain'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(COLUMN_KINDS),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const [maxRow] = await db
    .select({ maxPos: sql<number | null>`max(${schema.boardColumns.position})` })
    .from(schema.boardColumns)
  const position = maxRow?.maxPos != null ? maxRow.maxPos + 1000 : 1000

  const [row] = await db
    .insert(schema.boardColumns)
    .values({ name: body.name, kind: body.kind, position })
    .returning()
  if (!row) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })
  return toColumn(row)
})
