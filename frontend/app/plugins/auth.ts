/**
 * T23 — hydrate the session once, before the first render.
 *
 * Without this the header renders signed-out on every SSR request and only corrects
 * itself after the client mounts, which is a visible flash on a page that already
 * knows the answer. The plugin runs per request on the server (so the `useState` payload
 * carries the user) and once on the client.
 *
 * A backend that is not running is not a failure here: `refresh()` swallows transport
 * errors, the user reads as signed out, and the pages fall back to their mock fixtures
 * the way they already do.
 */
export default defineNuxtPlugin({
  name: 'auth',
  // Client-side it must finish before hydration so the payload and the store agree.
  enforce: 'pre',
  async setup() {
    const { refresh, consumeOAuthReturn } = useAuth()
    await refresh()
    // Arriving back from Google or GitHub: the API has just set the session cookie, so
    // `refresh()` above picked the user up. Send them to wherever they were going.
    const target = consumeOAuthReturn()
    if (target !== null) await navigateTo(target, { replace: true })
  },
})
