import { asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  columnId: z.uuid().optional(),
  deadline: z.iso.date().nullable().optional(),
  tagIds: z.array(z.uuid()).optional().default([]),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const now = new Date()

  try {
    return await db.transaction(async (tx) => {
      let targetColumn: typeof schema.boardColumns.$inferSelect | undefined
      if (body.columnId !== undefined) {
        const [col] = await tx.select().from(schema.boardColumns).where(eq(schema.boardColumns.id, body.columnId))
        if (!col) throw createError({ statusCode: 400, statusMessage: 'Unknown columnId' })
        targetColumn = col
      }
      else {
        const columns = await tx.select().from(schema.boardColumns).orderBy(asc(schema.boardColumns.position))
        targetColumn = columns.find(c => c.kind === 'open' && !c.hidden) ?? columns[0]
        if (!targetColumn) throw createError({ statusCode: 500, statusMessage: 'No columns exist' })
      }

      const [maxRow] = await tx
        .select({ maxPos: sql<number | null>`max(${schema.tasks.position})` })
        .from(schema.tasks)
        .where(eq(schema.tasks.columnId, targetColumn.id))
      const position = maxRow?.maxPos != null ? maxRow.maxPos + 1000 : 1000

      const [row] = await tx
        .insert(schema.tasks)
        .values({
          title: body.title,
          description: body.description ?? null,
          projectId: body.projectId ?? null,
          columnId: targetColumn.id,
          position,
          deadline: body.deadline ?? null,
          ...(targetColumn.kind === 'done' ? { completedAt: now } : {}),
        })
        .returning()
      if (!row) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

      if (body.tagIds.length > 0) {
        await tx.insert(schema.taskTags).values(body.tagIds.map(tagId => ({ taskId: row.id, tagId })))
      }

      await tx.insert(schema.taskStateEvents).values({
        taskId: row.id,
        fromColumnId: null,
        toColumnId: targetColumn.id,
        toKind: targetColumn.kind,
        changedAt: now,
      })

      return toTask(row, body.tagIds)
    })
  }
  catch (e) {
    if (isForeignKeyViolation(e)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid projectId or tagIds' })
    }
    throw e
  }
})
