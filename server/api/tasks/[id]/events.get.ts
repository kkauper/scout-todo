import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { StateEvent } from '#shared/types/domain'

const paramsSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event): Promise<StateEvent[]> => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const db = useDb()
  const rows = await db
    .select()
    .from(schema.taskStateEvents)
    .where(eq(schema.taskStateEvents.taskId, id))
    .orderBy(asc(schema.taskStateEvents.changedAt))

  return rows.map(r => ({
    taskId: r.taskId,
    fromColumnId: r.fromColumnId,
    toColumnId: r.toColumnId,
    toKind: r.toKind,
    changedAt: r.changedAt.toISOString(),
  }))
})
