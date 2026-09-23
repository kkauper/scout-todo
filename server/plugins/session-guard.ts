export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    // Anonymous visitors have no user; only signed-in sessions are version-checked.
    if (!session.user?.id) return
    await assertSessionCurrent(event, session)
  })
})
