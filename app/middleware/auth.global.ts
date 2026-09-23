export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useUserSession()
  // Sessions from the single-account version have no user id; the server rejects them.
  const signedIn = loggedIn.value && !!user.value?.id
  if (!signedIn && to.path !== '/login') return navigateTo('/login')
  if (signedIn && to.path === '/login') return navigateTo('/')
})
