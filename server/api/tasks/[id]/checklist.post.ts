import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ChecklistItem } from '#shared/types/domain'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  titles: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
})

export default defineEventHandler(async (event): Promise<ChecklistItem[]> => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const now = new Date()

  return await db.transaction(async (tx) => {
    const [task] = await tx.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.id, id))
    if (!task) throw createError({ statusCode: 404 })

    const [maxRow] = await tx
      .select({ maxPos: sql<number | null>`max(${schema.checklistItems.position})` })
      .from(schema.checklistItems)
      .where(eq(schema.checklistItems.taskId, id))
    let position = maxRow?.maxPos != null ? maxRow.maxPos : 0

    const values = body.titles.map((title) => {
      position += 1000
      return { taskId: id, title, position }
    })

    const rows = await tx.insert(schema.checklistItems).values(values).returning()

    await tx.update(schema.tasks).set({ updatedAt: now }).where(eq(schema.tasks.id, id))

    return rows.map(toChecklistItem)
  })
})
