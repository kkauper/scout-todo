import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const db = useDb()
  await db.update(schema.users).set({ anthropicApiKey: null }).where(eq(schema.users.id, userId))

  const config = useRuntimeConfig(event)
  return {
    claudeKeyConfigured: false,
    claudeKeyHint: null,
    encryptionConfigured: !!config.encryptionKey,
  }
})
