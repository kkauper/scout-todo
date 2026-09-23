export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const decrypted = await getUserAnthropicKey(event)

  return {
    claudeKeyConfigured: decrypted !== null,
    claudeKeyHint: decrypted !== null ? secretHint(decrypted) : null,
    encryptionConfigured: !!config.encryptionKey,
  }
})
