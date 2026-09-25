import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { validateEntryTimes } from '#shared/utils/timer'
import { ENTRY_TIMES_ERROR_MESSAGES } from '#shared/types/domain'
import type { TimeEntry } from '#shared/types/domain'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  startedAt: z.iso.datetime({ offset: true }).optional(),
  endedAt: z.iso.datetime({ offset: true }).optional(),
}).refine((b) => b.startedAt !== undefined || b.endedAt !== undefined, { message: 'Nothing to update' })

export default defineEventHandler(async (event): Promise<TimeEntry> => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const now = new Date()

  return await db.transaction(async (tx) => {
    await closeStaleTimer(tx, userId, now)

    const [existing] = await tx.select().from(schema.timeEntries).where(and(eq(schema.timeEntries.id, id), eq(schema.timeEntries.userId, userId)))
    if (!existing) throw createError({ statusCode: 404 })

    const newStart = body.startedAt ? new Date(body.startedAt) : existing.startedAt
    const newEnd = body.endedAt ? new Date(body.endedAt) : existing.endedAt

    const err = validateEntryTimes(newStart, newEnd, now)
    if (err) throw createError({ statusCode: 422, statusMessage: ENTRY_TIMES_ERROR_MESSAGES[err], data: { code: err } })

    const unchanged = newStart.getTime() === existing.startedAt.getTime()
      && (newEnd === null ? existing.endedAt === null : existing.endedAt !== null && newEnd.getTime() === existing.endedAt.getTime())
    if (unchanged) return toTimeEntry(existing)

    const [updated] = await tx
      .update(schema.timeEntries)
      .set({
        startedAt: newStart,
        endedAt: newEnd,
        editedAt: now,
        originalStartedAt: existing.originalStartedAt ?? existing.startedAt,
        originalEndedAt: existing.editedAt ? existing.originalEndedAt : existing.endedAt,
      })
      .where(and(eq(schema.timeEntries.id, id), eq(schema.timeEntries.userId, userId)))
      .returning()
    if (!updated) throw createError({ statusCode: 404 })

    return toTimeEntry(updated)
  })
})
