/**
 * Mock session. A fake user serialised to a cookie, nothing more — no token,
 * no expiry handling, no refresh. The real session (T14/T23) replaces this.
 *
 * Types are inferred from the fixtures so this shared module never imports
 * `~/utils/mock/types.ts`, which is a placeholder for the generated API types.
 */
import { USERS } from '~/utils/mock'

export type MockSessionUser = (typeof USERS)[number]

interface StoredSession {
  id?: string
  name: string
  email: string
  role: MockSessionUser['role']
}

const COOKIE_NAME = 'gazette-session'

function toUser(stored: StoredSession | null): MockSessionUser | null {
  if (!stored) return null
  const fixture = stored.id ? USERS.find(user => user.id === stored.id) : undefined
  if (fixture) return fixture
  return {
    id: `usr_${stored.email.toLowerCase()}`,
    name: stored.name,
    email: stored.email,
    role: stored.role,
    avatarUrl: `https://picsum.photos/seed/avatar-${stored.email.toLowerCase()}/96/96`,
  }
}

export function useSession() {
  // Typed unknown on read: the cookie layer may hand back an already-parsed
  // value, so the reader normalises instead of assuming a string.
  const cookie = useCookie<unknown>(COOKIE_NAME, {
    default: () => null,
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  })

  const current = computed<MockSessionUser | null>(() => {
    const raw = cookie.value as string | StoredSession | null
    if (!raw) return null
    if (typeof raw === 'object') return toUser(raw)
    try {
      return toUser(JSON.parse(raw) as StoredSession)
    }
    catch {
      return null
    }
  })

  const isSignedIn = computed(() => current.value !== null)

  function signInAs(user: MockSessionUser): void {
    const stored: StoredSession = { id: user.id, name: user.name, email: user.email, role: user.role }
    cookie.value = JSON.stringify(stored)
  }

  /** A registered user is a fake user: whatever was typed, plus the host intent. */
  function signInRegistered(name: string, email: string, wantsToHost: boolean): void {
    const stored: StoredSession = { name, email, role: wantsToHost ? 'HOST' : 'GUEST' }
    cookie.value = JSON.stringify(stored)
  }

  function signOut(): void {
    cookie.value = null
  }

  return { current, isSignedIn, signInAs, signInRegistered, signOut }
}
