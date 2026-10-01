/**
 * Display formatting. One format per context, per the money table in context/ui-tokens.md:
 *
 * - `usd()`      — whole dollars, for listing and search cards.
 * - `usdCents()` — 2 decimals, for anything payable.
 * - `payableCents()` — the same, in the currency the API actually quoted.
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

const payableFormatters = new Map<string, Intl.NumberFormat>()

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

/**
 * Two decimals, currency symbol first, in the currency the server quoted. The currency
 * symbol is a claim about the currency, so formatting a EUR quote with the USD formatter
 * would be a wrong label rather than a cosmetic difference.
 *
 * An unrecognised code falls back to USD instead of throwing: the code arrives from an
 * API payload, and a `RangeError` inside a template would take the whole page down.
 */
export function payableCents(cents: number, currency: string): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : 'USD'
  let formatter = payableFormatters.get(code)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    payableFormatters.set(code, formatter)
  }
  return formatter.format(cents / 100)
}

/** Two decimals in USD. Payable context on the pages that only ever quote USD. */
export function usdCents(cents: number): string {
  return payableCents(cents, 'USD')
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
