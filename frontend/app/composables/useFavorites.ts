/**
 * Favourite state, one record keyed by hotel id, shared by every heart on the page.
 *
 * A `ref` per component would be correct right up until two hearts for the same hotel
 * render at once, and the detail page reuses its component instance across a route
 * change — so a naive local boolean would show `/hotels/b` the heart state `/hotels/a`
 * left behind. One keyed record is what makes both impossible. Callers read it through
 * a `computed` on the id they hold, which is what makes a changed id re-read.
 *
 * **Nothing here is persisted, on purpose.** The T19 contract has writes only: there is
 * no `GET /api/favorites`, so the server never confirms that a heart this browser
 * remembers is actually filled. A stored `pressed: true` would outlive the reload and
 * keep telling a guest their shortlist has a hotel in it when the row behind it may
 * never have been written. Memory only, cleared by the reload; the list endpoint is a
 * later ticket's job and hydration is where it belongs.
 */
import { fetchFavorite, isApiError, unfavorite } from '~/utils/api'

/** `signin-required` gets an affordance, everything else is a retryable failure. */
export type FavoriteProblem = 'signin-required' | 'failed'

export interface FavoriteEntry {
  /** Optimistic while a request is in flight, reconciled against the response after. */
  pressed: boolean
  pending: boolean
  /** Set only when a toggle failed. `null` means there is nothing to report. */
  problem: FavoriteProblem | null
}

/** Every heart starts un-pressed: the initial state is unknown until somebody presses it. */
const UNKNOWN: FavoriteEntry = { pressed: false, pending: false, problem: null }

export function useFavorites() {
  const entries = useState<Record<string, FavoriteEntry>>('favorites', () => ({}))

  function entryFor(hotelId: string): FavoriteEntry {
    return entries.value[hotelId] ?? UNKNOWN
  }

  async function toggle(hotelId: string): Promise<void> {
    const before = entries.value[hotelId] ?? UNKNOWN
    // The press is already in flight; a second one would be a double submit, not a toggle.
    if (before.pending) return

    // The state the guest asked for. Everything below reconciles the optimistic entry
    // against what the server said, so the branch is driven by the *desired* state rather
    // than by the current one — inverting those two is the easy way to write a heart that
    // un-favourites when you press it.
    const desired = !before.pressed
    entries.value[hotelId] = { pressed: desired, pending: true, problem: null }

    try {
      if (!desired) {
        // 204 whether or not the row was there, so there is nothing to reconcile.
        await unfavorite(hotelId)
        entries.value[hotelId] = { pressed: false, pending: false, problem: null }
        return
      }

      try {
        await fetchFavorite(hotelId)
      }
      catch (error: unknown) {
        // `FAVORITE_EXISTS` means the row is already there, which is exactly the state the
        // press asked for. It is not a failure — reading it as one makes a double tap, or
        // a heart pressed after a reload, look broken. Everything else keeps propagating
        // to the rollback below.
        if (!isApiError(error) || error.code !== 'FAVORITE_EXISTS') throw error
      }
      entries.value[hotelId] = { pressed: true, pending: false, problem: null }
    }
    catch (error: unknown) {
      // Roll the heart back to where it was, and say why it is not where the guest left it.
      entries.value[hotelId] = {
        pressed: before.pressed,
        pending: false,
        problem: isApiError(error) && error.code === 'UNAUTHORIZED' ? 'signin-required' : 'failed',
      }
    }
  }

  return { entryFor, toggle }
}
