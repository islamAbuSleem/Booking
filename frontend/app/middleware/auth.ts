/**
 * T23 — auth and role redirect for `/dashboard/*`.
 *
 * **UX only.** It stops a signed-out visitor seeing an empty dashboard shell and stops a
 * guest following a host link they cannot use. It is not, and must never be treated as,
 * an authorization boundary: the NestJS `JwtAuthGuard` and `RolesGuard` re-check the
 * session and the role on every host and admin route, so a user who skips this middleware
 * entirely gets a 403 from the API rather than the data. The client is allowed to be
 * wrong about who may see a page; the server is not.
 *
 * The session is normally already hydrated by `app/plugins/auth.ts`. `refresh()` here is
 * the fallback for the two cases that plugin cannot cover: a cookie set in another tab
 * after this one loaded, and a direct SSR hit where the plugin ran before the cookie
 * existed.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { isSignedIn, isAdmin, isHost, refresh } = useAuth()

  if (!isSignedIn.value) await refresh()
  if (!isSignedIn.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  // `/dashboard/admin` is admin-only, including for hosts: a host is not an admin with
  // fewer permissions, they are a different role (D14, "no hierarchy").
  if (to.path.startsWith('/dashboard/admin') && !isAdmin.value) {
    return navigateTo(isHost.value ? '/dashboard/host' : '/')
  }

  // Everything else under the dashboard is the host's own surface.
  if (!isHost.value) return navigateTo('/')
})
