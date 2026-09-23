import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { ChecklistItem } from '#shared/types/domain'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    done: z.boolean().optional(),
    position: z.number().finite().optional(),
  })
  .refine(b => b.title !== undefined || b.done !== undefined || b.position !== undefined, { message: 'At least one field required' })

export default defineEventHandler(async (event): Promise<ChecklistItem> => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const now = new Date()

  return await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.checklistItems).where(eq(schema.checklistItems.id, id))
    if (!existing) throw createError({ statusCode: 404 })

    const set: Partial<typeof schema.checklistItems.$inferInsert> = {}
    if (body.title !== undefined) set.title = body.title
    if (body.position !== undefined) set.position = body.position
    if (body.done !== undefined) {
      set.done = body.done
      if (body.done && !existing.done) set.completedAt = now
      else if (!body.done) set.completedAt = null
    }

    const [row] = await tx
      .update(schema.checklistItems)
      .set(set)
      .where(eq(schema.checklistItems.id, id))
      .returning()
    if (!row) throw createError({ statusCode: 404 })

    await tx.update(schema.tasks).set({ updatedAt: now }).where(eq(schema.tasks.id, existing.taskId))

    return toChecklistItem(row)
  })
})
