export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  if (path.startsWith('/api/')) {
    if (path === '/api/auth/login' || path.startsWith('/api/_auth/')) return
    const session = await requireUserSession(event)
    await assertSessionCurrent(event, session)
    return
  }

  // Page requests: if a session cookie is present but stale (deleted user or
  // rotated session version), clear it so the client-side render sees no
  // session and redirects to /login exactly once, instead of looping.
  if (path.startsWith('/_nuxt/') || /\.[a-zA-Z0-9]+$/.test(path)) return
  const session = await getUserSession(event)
  if (!session.user) return
  const current = await isSessionCurrent(event, session)
  if (!current) await clearUserSession(event)
})
