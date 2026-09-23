export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  if (path === '/api/auth/login' || path.startsWith('/api/_auth/')) return
  const session = await requireUserSession(event)
  await assertSessionCurrent(event, session)
})
