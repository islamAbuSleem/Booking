import type { Response } from 'express';

/**
 * T14 — the session cookie.
 *
 * Cookie `maxAge` units differ between APIs: Express `res.cookie()` takes
 * **milliseconds** while Nest 12.1's `httpAdapter.setCookie()` takes
 * **seconds**. Copying a value between them makes the cookie live 1000x too
 * long. This module uses Express `res.cookie()` **everywhere** and every value
 * here is in milliseconds. Do not mix in `setCookie()` without converting.
 */

export const AUTH_COOKIE_NAME = 'access_token';

/** Default session lifetime, used when JWT_EXPIRES_IN cannot be parsed. */
export const DEFAULT_AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface CookieFlags {
  /** True in production (HTTPS). False in dev/test so `http://localhost` works. */
  secure: boolean;
}

/**
 * Parses the `JWT_EXPIRES_IN` forms jsonwebtoken accepts (`60`, `15m`, `12h`,
 * `7d`, `3600s`) into milliseconds for `res.cookie({ maxAge })`. Unknown
 * forms fall back to 7 days rather than to a session cookie, so a typo never
 * silently shortens a session to the browser lifetime.
 */
export function expiresInToMs(expiresIn: string): number {
  const trimmed = expiresIn.trim();
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(trimmed);
  if (!match) return DEFAULT_AUTH_COOKIE_MAX_AGE_MS;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount)) return DEFAULT_AUTH_COOKIE_MAX_AGE_MS;
  switch (match[2] ?? 's') {
    case 'ms':
      return amount;
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60 * 1000;
    case 'h':
      return amount * 60 * 60 * 1000;
    case 'd':
      return amount * 24 * 60 * 60 * 1000;
    default:
      return DEFAULT_AUTH_COOKIE_MAX_AGE_MS;
  }
}

export function setAuthCookie(
  res: Response,
  token: string,
  maxAgeMs: number,
  flags: CookieFlags,
): void {
  // Express `maxAge` is milliseconds. See the module comment.
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: flags.secure,
    maxAge: maxAgeMs,
    path: '/',
  });
}

export function clearAuthCookie(res: Response, flags: CookieFlags): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: flags.secure,
    path: '/',
  });
}
