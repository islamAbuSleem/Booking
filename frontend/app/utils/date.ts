/**
 * Date-only helpers for stay dates.
 *
 * A stay date is `YYYY-MM-DD` and has no timezone — the same string the backend stores and
 * the `<input type="date">` control wants. `toISOString()` cannot produce one: it converts
 * to UTC first, so a guest in New York asking for "today" at 9pm local gets tomorrow's
 * date, and the check-in picker then blocks them from booking tonight.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Today in the browser's own timezone, as `YYYY-MM-DD`. */
export function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const DAY_MS = 86_400_000

/**
 * The `count` nights of a stay beginning on `checkIn`, in order. The half-open rule read
 * from the other end: `checkOut` is the day after the last night, so a four-night stay
 * from the 14th lists the 14th to the 17th.
 *
 * Every step is a UTC instant read through a UTC getter. Adding 86_400_000ms to a
 * UTC-midnight date is exactly one day, so a guest in a negative-offset timezone cannot
 * have a night shifted by a day (the same rule the API's `stayNights` applies).
 */
export function stayNights(checkIn: string, count: number): string[] {
  const first = Date.parse(`${checkIn}T00:00:00.000Z`)
  if (Number.isNaN(first) || count < 1) return []
  return Array.from({ length: count }, (_, night) => new Date(first + night * DAY_MS).toISOString().slice(0, 10))
}
