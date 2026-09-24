import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { TASK_LINK_TYPES } from '#shared/types/domain'
import { normalizeLink } from '#shared/utils/links'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  toTaskId: z.uuid(),
  type: z.enum(TASK_LINK_TYPES),
})

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const normalized = normalizeLink(id, body.toTaskId, body.type)
  if (!normalized) throw createError({ statusCode: 422, statusMessage: 'Cannot link a task to itself' })

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.tasks)
        .where(and(inArray(schema.tasks.id, [id, body.toTaskId]), eq(schema.tasks.userId, userId)))
      if ((row?.count ?? 0) !== 2) throw createError({ statusCode: 404 })

      if (body.type === 'blocks') {
        const [cycle] = await tx
          .select({ id: schema.taskLinks.id })
          .from(schema.taskLinks)
          .where(and(eq(schema.taskLinks.type, 'blocks'), eq(schema.taskLinks.fromTaskId, body.toTaskId), eq(schema.taskLinks.toTaskId, id)))
        if (cycle) throw createError({ statusCode: 422, statusMessage: 'Would create a blocking cycle' })
      }

      const [inserted] = await tx
        .insert(schema.taskLinks)
        .values({ fromTaskId: normalized.fromTaskId, toTaskId: normalized.toTaskId, type: body.type })
        .returning()
      if (!inserted) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })

      setResponseStatus(event, 201)
      return toTaskLink(inserted)
    })
  }
  catch (e) {
    if (isUniqueViolation(e)) {
      throw createError({ statusCode: 409, statusMessage: 'Link already exists' })
    }
    throw e
  }
})
