import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  deadline: z.iso.date().nullable().optional(),
  tagIds: z.array(z.uuid()).optional(),
})

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const { tagIds, ...taskFields } = body

  try {
    const updated = await db.transaction(async (tx) => {
      await assertOwnedRefs(tx, userId, { projectId: taskFields.projectId, tagIds }, 'Unknown project or tag')

      const [row] = await tx
        .update(schema.tasks)
        .set({ ...taskFields, updatedAt: new Date() })
        .where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)))
        .returning()
      if (!row) return false

      if (tagIds !== undefined) {
        await tx.delete(schema.taskTags).where(eq(schema.taskTags.taskId, id))
        if (tagIds.length > 0) {
          await tx.insert(schema.taskTags).values(tagIds.map(tagId => ({ taskId: id, tagId })))
        }
      }
      return true
    })

    if (!updated) throw createError({ statusCode: 404 })
    const task = await loadTaskDto(db, userId, id)
    if (!task) throw createError({ statusCode: 404 })
    return task
  }
  catch (e) {
    if (isForeignKeyViolation(e)) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown project or tag' })
    }
    throw e
  }
})
