import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { CookieFlags } from './cookie.js';

/**
 * T15 — where the OAuth round trip started, so the callback can send the user
 * back there.
 *
 * `FRONTEND_ORIGIN` is a comma-separated list, and a deployment with more than
 * one of them is the normal case (a marketing site and the app, or staging and
 * prod sharing an API). Always redirecting to the first entry drops everyone who
 * started anywhere else onto the wrong host, and the session cookie is scoped to
 * the API, so they land logged out.
 *
 * The callback cannot recover the origin on its own: by the time it runs the
 * browser is on `accounts.google.com`, so `Referer` is the provider or nothing.
 * The entry route therefore records the origin in a short-lived, httpOnly cookie
 * and the callback reads it back.
 *
 * Everything read from the request is validated against `FRONTEND_ORIGIN`
 * before it is stored or used — an unvalidated redirect target is an open
 * redirect, and this one sits right after a successful login.
 */

const DEFAULT_ORIGIN = 'http://localhost:3000';

export const OAUTH_ORIGIN_COOKIE = 'oauth_origin';

/** Ten minutes: long enough for a password manager and a consent screen. */
export const OAUTH_ORIGIN_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * `FRONTEND_ORIGIN` is a comma-separated list (config/env.ts validates it that way), and
 * `cors` compares its `origin` option against the request header as a whole. Handing it
 * the raw string would make `http://a.test,https://b.test` a single origin that matches
 * nothing, so the list is split and the entries trimmed before it reaches the middleware.
 */
export function allowedOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? DEFAULT_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : [DEFAULT_ORIGIN];
}

/** The `scheme://host[:port]` of a URL, or null when the value is not a URL. */
export function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const cookies = (req as { cookies?: Record<string, string> }).cookies;
  return cookies?.[name];
}

/**
 * The origin the callback redirects to: the one the flow started on when it is
 * still configured, otherwise the first entry. A remembered origin that has
 * since been removed from `FRONTEND_ORIGIN` falls back rather than redirecting
 * to a host the API no longer serves.
 */
export function readOAuthOrigin(req: Request, allowed: string[]): string {
  const remembered = originOf(readCookie(req, OAUTH_ORIGIN_COOKIE));
  if (remembered && allowed.includes(remembered)) return remembered;
  return allowed[0] ?? DEFAULT_ORIGIN;
}

export function clearOAuthOrigin(res: Response, flags: CookieFlags): void {
  res.clearCookie(OAUTH_ORIGIN_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: flags.secure,
    path: '/',
  });
}

/**
 * Entry routes only. Nest runs middleware before guards, so the cookie is set
 * before Passport 302s to the provider — the entry handler itself never runs.
 */
@Injectable()
export class OAuthOriginMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const allowed = allowedOrigins(this.config.get<string>('FRONTEND_ORIGIN'));
    // The frontend either names itself or is the page that linked here; `Referer`
    // is the fallback for a plain link to `/api/auth/google`.
    const query = req.query['origin'];
    const candidate =
      originOf(typeof query === 'string' ? query : undefined) ??
      originOf(req.headers.referer);
    if (candidate && allowed.includes(candidate)) {
      res.cookie(OAUTH_ORIGIN_COOKIE, candidate, {
        httpOnly: true,
        // `lax`, not `strict`: the provider returns with a top-level GET
        // navigation, which carries lax cookies and would drop strict ones.
        sameSite: 'lax',
        secure: this.config.get<string>('NODE_ENV') === 'production',
        maxAge: OAUTH_ORIGIN_MAX_AGE_MS,
        path: '/',
      });
    }
    next();
  }
}
