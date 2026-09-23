import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { COLUMN_KINDS } from '#shared/types/domain'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    kind: z.enum(COLUMN_KINDS).optional(),
    hidden: z.boolean().optional(),
    position: z.number().finite().optional(),
  })
  .refine(b => b.name !== undefined || b.kind !== undefined || b.hidden !== undefined || b.position !== undefined, {
    message: 'At least one field required',
  })

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const now = new Date()

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.boardColumns).where(and(eq(schema.boardColumns.id, id), eq(schema.boardColumns.userId, userId))).for('update')
    if (!existing) return null

    const { kind, ...rest } = body
    const [row] = await tx
      .update(schema.boardColumns)
      .set({ ...rest, ...(kind !== undefined ? { kind } : {}), updatedAt: now })
      .where(eq(schema.boardColumns.id, id))
      .returning()
    if (!row) return null

    if (kind !== undefined && kind !== existing.kind) {
      if (existing.kind !== 'done' && kind === 'done') {
        await tx
          .update(schema.tasks)
          .set({ completedAt: now })
          .where(and(eq(schema.tasks.columnId, id), isNull(schema.tasks.completedAt)))
      }
      else if (existing.kind === 'done' && kind !== 'done') {
        await tx
          .update(schema.tasks)
          .set({ completedAt: null })
          .where(eq(schema.tasks.columnId, id))
      }
    }

    return row
  })

  if (!updated) throw createError({ statusCode: 404 })
  return toColumn(updated)
})
