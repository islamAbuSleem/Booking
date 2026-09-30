/**
 * Auth redirect for /dashboard/*.
 *
 * UX polish only — it keeps a signed-out visitor from seeing an empty
 * dashboard shell. The API is the real enforcement: every host and admin
 * endpoint re-checks the session and the role server-side, so this middleware
 * must never be treated as an authorization boundary.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { isSignedIn } = useSession()
  if (isSignedIn.value) return
  return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
})
