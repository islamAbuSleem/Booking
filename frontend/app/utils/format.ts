/**
 * Display formatting. One format per context, per the money table in context/ui-tokens.md:
 *
 * - `usd()`      — whole dollars, for listing and search cards.
 * - `usdCents()` — 2 decimals, for anything payable.
 * - `shortDate()`— stay dates, which are date-only `YYYY-MM-DD` and must never shift a
 *                  day because of the viewer's timezone.
 *
 * All through `Intl`. No hand-rolled strings (context/code-standards.md).
 */

const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const payableDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const plainNumber = new Intl.NumberFormat('en-US')

const stayDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

const shortStayDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** Whole dollars. Listing and search context only. */
export function usd(cents: number): string {
  return wholeDollars.format(cents / 100)
}

/** Two decimals, currency symbol first. Payable context only. */
export function usdCents(cents: number): string {
  return payableDollars.format(cents / 100)
}

/** Review counts, guest counts, inventory. Never abbreviated. */
export function wholeNumber(value: number): string {
  return plainNumber.format(value)
}

export function formatStayDate(iso: string): string {
  return stayDate.format(new Date(`${iso}T00:00:00Z`))
}

export function formatShortStayDate(iso: string): string {
  return shortStayDate.format(new Date(`${iso}T00:00:00Z`))
}
