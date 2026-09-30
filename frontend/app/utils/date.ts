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
