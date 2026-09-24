import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const db = useDb()
  const now = new Date()

  await db.transaction(async (tx) => {
    await closeStaleTimer(tx, userId, now)

    const [existing] = await tx.select().from(schema.timeEntries).where(and(eq(schema.timeEntries.id, id), eq(schema.timeEntries.userId, userId)))
    if (!existing) throw createError({ statusCode: 404 })
    if (existing.endedAt === null) throw createError({ statusCode: 409, statusMessage: 'Stop the timer first' })

    const [row] = await tx.delete(schema.timeEntries).where(eq(schema.timeEntries.id, id)).returning()
    if (!row) throw createError({ statusCode: 404 })
  })

  setResponseStatus(event, 204)
  return null
})
