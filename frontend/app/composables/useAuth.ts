/**
 * T23 — the real session. Replaces the Phase 1 mock (`useSession`), which is deleted.
 *
 * State lives in `useState`, not a plain `ref`, for two reasons: every caller has to
 * observe the *same* session (the header, the route middleware and a page each call
 * `useAuth()` independently, and a per-call `ref` would give each its own copy), and
 * `useState` is serialised into the SSR payload so the first paint already knows who is
 * signed in instead of flashing the signed-out header.
 *
 * The JWT lives in an httpOnly `SameSite=Lax` cookie set by the API — this composable
 * never sees it. Every call therefore goes through `apiFetch`, which sends
 * `credentials: 'include'` and forwards the incoming `cookie` header during SSR, and
 * every request here re-reads the server rather than trusting a cached role.
 *
 * **This is not the authorization boundary.** The NestJS guards are. A user who edits
 * the payload out of `useState` gets a shell that renders the wrong links and a 403 from
 * the API on every call.
 */
import { apiFetch, ApiRequestError } from '~/utils/api'
import type { components } from '~/types/api'

/** From the generated contract, not hand-written — the API owns the shape (D38). */
export type AuthUser = components['schemas']['AuthUser']
export type AuthRole = AuthUser['role']

interface AuthSessionData {
  user: AuthUser
  token: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput extends LoginInput {
  name: string
  wantsToHost: boolean
}

/** 401 is the *answer* to "is anyone signed in", not a failure to render a page. */
function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === 'UNAUTHORIZED'
}

/**
 * Sign-out is a goal state, not a success signal: what matters is "no session", and two
 * different answers satisfy it.
 *
 *   - `UNAUTHORIZED` — the cookie was already gone.
 *   - `BAD_RESPONSE` — the API's logout is a bodyless 204, and `apiFetch` only tolerates an
 *     empty body for DELETE, so a successful sign-out reaches us as an unreadable response.
 *     The request did exactly what we asked; clearing the session is the right reading.
 *
 * A real failure — a 500, a transport error — is still rethrown, so the caller learns the
 * cookie may still be valid rather than showing a signed-out header over a live session.
 */
function isSignedOut(error: unknown): boolean {
  return isUnauthenticated(error)
    || (error instanceof ApiRequestError && error.code === 'BAD_RESPONSE')
}

/**
 * Where the visitor was heading before an OAuth detour.
 *
 * The API's callback remembers only the *origin* it started on (`oauth_origin` carries a
 * `scheme://host:port`, and it has to — an arbitrary path from a request would be an open
 * redirect), so a `?redirect=/dashboard/host` is dropped on the way out to the provider.
 * The target is parked here instead, for ten minutes to match the API's own window.
 */
const OAUTH_RETURN_COOKIE = 'oauth-return'
const OAUTH_RETURN_MAX_AGE = 60 * 10

/** A single leading slash, and no scheme — an absolute URL here would be an open redirect. */
function isSafeInternalPath(value: unknown): value is string {
  return typeof value === 'string' && /^\/(?!\/)/.test(value)
}

export function useAuth() {
  const current = useState<AuthUser | null>('auth:user', () => null)
  // An in-flight *count*, not a flag. `register`, `login` and `logout` share one
  // composable, and a single boolean let whichever settled first re-enable the submit
  // button while another request was still running — a duplicate submit — or let an
  // in-flight logout disable the login form. `pending` stays a boolean for every caller.
  const inFlight = useState<number>('auth:pending', () => 0)
  const pending = computed(() => inFlight.value > 0)

  const isSignedIn = computed(() => current.value !== null)
  const role = computed<AuthRole | null>(() => current.value?.role ?? null)
  const isHost = computed(() => role.value === 'HOST' || role.value === 'ADMIN')
  const isAdmin = computed(() => role.value === 'ADMIN')

  /** Runs `work` with the shared in-flight count held up, whatever it settles to. */
  async function tracked<T>(work: () => Promise<T>): Promise<T> {
    inFlight.value += 1
    try {
      return await work()
    }
    finally {
      inFlight.value -= 1
    }
  }

  /**
   * Re-reads the session from the API. Called once per SSR request and once on client
   * hydration by `app/plugins/auth.ts`; the route middleware calls it again only when it
   * has no user yet.
   *
   * A 401 clears the user. Any other failure — no backend listening, a 500 — leaves the
   * existing value alone rather than signing the user out because a service blinked.
   */
  async function refresh(): Promise<void> {
    try {
      const { user } = await apiFetch<{ user: AuthUser }>('/api/auth/me')
      current.value = user
    }
    catch (error) {
      if (isUnauthenticated(error)) current.value = null
    }
  }

  async function register(input: RegisterInput): Promise<AuthUser> {
    return tracked(async () => {
      const session = await apiFetch<AuthSessionData>('/api/auth/register', {
        method: 'POST',
        body: { ...input },
      })
      current.value = session.user
      return session.user
    })
  }

  async function login(input: LoginInput): Promise<AuthUser> {
    return tracked(async () => {
      const session = await apiFetch<AuthSessionData>('/api/auth/login', {
        method: 'POST',
        body: { ...input },
      })
      current.value = session.user
      return session.user
    })
  }

  /**
   * Clears the cookie server-side. Both "there is no session" answers clear the local
   * value; see `isSignedOut` for why a bodyless 204 counts.
   */
  async function logout(): Promise<void> {
    return tracked(async () => {
      try {
        await apiFetch<undefined>('/api/auth/logout', { method: 'POST' })
        current.value = null
      }
      catch (error) {
        if (isSignedOut(error)) current.value = null
        else throw error
      }
    })
  }

  /**
   * Leaves for the provider. A full-page navigation, not `$fetch`: the API answers 302
   * and Passport drives the rest, so the browser has to be the one making the request or
   * the `Set-Cookie` never reaches the jar.
   */
  function startOAuth(provider: 'google' | 'github', redirectTo?: string): void {
    const returnTo = useCookie<string | null>(OAUTH_RETURN_COOKIE, {
      default: () => null,
      maxAge: OAUTH_RETURN_MAX_AGE,
      sameSite: 'lax',
    })
    if (isSafeInternalPath(redirectTo)) returnTo.value = redirectTo

    const { apiBase } = useRuntimeConfig().public
    const base = typeof apiBase === 'string' && apiBase.length > 0 ? apiBase : 'http://localhost:3000'
    window.location.assign(`${base}/api/auth/${provider}`)
  }

  /**
   * Called once on return from the provider. Returns the path to go to, or null when this
   * is an ordinary page load and the visitor should stay put.
   *
   * The cookie is cleared on read, so a later visit does not bounce the visitor to a stale
   * dashboard URL they finished with ten minutes ago.
   */
  function consumeOAuthReturn(): string | null {
    const returnTo = useCookie<string | null>(OAUTH_RETURN_COOKIE, {
      default: () => null,
      maxAge: OAUTH_RETURN_MAX_AGE,
      sameSite: 'lax',
    })
    const target = returnTo.value
    if (target === null) return null
    returnTo.value = null
    return isSafeInternalPath(target) ? target : null
  }

  return {
    current: readonly(current),
    pending: readonly(pending),
    isSignedIn,
    role,
    isHost,
    isAdmin,
    refresh,
    register,
    login,
    logout,
    startOAuth,
    consumeOAuthReturn,
  }
}
