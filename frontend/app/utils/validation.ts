/**
 * Form validation for Phase 1.
 *
 * Zod-shaped, not Zod: each schema exposes `safeParse(values)` returning
 * `{ success, errors }` keyed by field name, so the call site reads like the
 * API's Zod schemas and the swap in the wiring tickets is mechanical.
 *
 * Email is validated structurally — length caps, exactly one `@`, a dotted
 * domain — which is what `z.email()` checks at this level. Deliberately not a
 * regex: a hand-rolled email regex always disagrees with the server on an edge
 * case, and the API is authoritative.
 */

export type FieldErrors = Record<string, string>

export interface ParseResult<T> {
  success: boolean
  data?: T
  errors: FieldErrors
}

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 254) return false
  if (trimmed.includes(' ') || trimmed.includes('\t') || trimmed.includes('\n')) return false
  const at = trimmed.indexOf('@')
  if (at <= 0 || at !== trimmed.lastIndexOf('@') || at > 64) return false
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  if (!local || !domain || domain.length > 253) return false
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false
  if (domain.startsWith('-') || domain.endsWith('-')) return false
  const lastDot = domain.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === domain.length - 1) return false
  return domain.slice(lastDot + 1).length >= 2
}

export const MIN_PASSWORD_LENGTH = 8

export interface LoginValues {
  email: string
  password: string
}

export const loginSchema = {
  safeParse(values: LoginValues): ParseResult<LoginValues> {
    const errors: FieldErrors = {}
    if (!isValidEmail(values.email)) errors.email = 'auth.emailInvalid'
    if (!values.password) errors.password = 'auth.passwordRequired'
    else if (values.password.length < MIN_PASSWORD_LENGTH) errors.password = 'auth.passwordTooShort'
    return Object.keys(errors).length
      ? { success: false, errors }
      : { success: true, data: { email: values.email.trim(), password: values.password }, errors: {} }
  },
}

export interface RegisterValues extends LoginValues {
  name: string
  wantsToHost: boolean
}

export const registerSchema = {
  safeParse(values: RegisterValues): ParseResult<RegisterValues> {
    const base = loginSchema.safeParse(values)
    const errors: FieldErrors = { ...base.errors }
    if (values.name.trim().length < 2) errors.name = 'auth.nameTooShort'
    return Object.keys(errors).length
      ? { success: false, errors }
      : {
          success: true,
          data: {
            email: values.email.trim(),
            password: values.password,
            name: values.name.trim(),
            wantsToHost: values.wantsToHost,
          },
          errors: {},
        }
  },
}

export interface GuestDetailsValues {
  name: string
  email: string
  phone: string
}

export const guestDetailsSchema = {
  safeParse(values: GuestDetailsValues): ParseResult<GuestDetailsValues> {
    const errors: FieldErrors = {}
    if (values.name.trim().length < 2) errors.name = 'booking.guestNameTooShort'
    if (!isValidEmail(values.email)) errors.email = 'auth.emailInvalid'
    if (values.phone.trim() && values.phone.trim().length < 7) errors.phone = 'booking.guestPhoneTooShort'
    return Object.keys(errors).length
      ? { success: false, errors }
      : {
          success: true,
          data: { name: values.name.trim(), email: values.email.trim(), phone: values.phone.trim() },
          errors: {},
        }
  },
}
