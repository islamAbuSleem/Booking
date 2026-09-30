import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  allowedOrigins,
  clearOAuthOrigin,
  OAUTH_ORIGIN_COOKIE,
  OAUTH_ORIGIN_MAX_AGE_MS,
  OAuthOriginMiddleware,
  originOf,
  readOAuthOrigin,
} from './oauth-origin.js';

const TWO_ORIGINS = 'http://localhost:3000,https://app.test';

function requestDouble(
  overrides: {
    query?: Record<string, unknown>;
    referer?: string;
    cookies?: Record<string, string>;
  } = {},
): Request {
  return {
    query: overrides.query ?? {},
    headers: overrides.referer ? { referer: overrides.referer } : {},
    cookies: overrides.cookies ?? {},
  } as unknown as Request;
}

function responseDouble(): {
  res: {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
} {
  return { res: { cookie: vi.fn(), clearCookie: vi.fn() } };
}

describe('originOf', () => {
  it('keeps only the scheme and host of a URL', () => {
    expect(originOf('https://app.test/login?next=/trips')).toBe(
      'https://app.test',
    );
  });

  it('returns null for anything that is not a URL', () => {
    expect(originOf('not a url')).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });
});

describe('readOAuthOrigin', () => {
  const allowed = allowedOrigins(TWO_ORIGINS);

  it('sends the user back to the origin the flow started on', () => {
    // The bug this fixes: a user who started on app.test was always dropped on
    // the first configured origin, localhost, where the session cookie is useless.
    const req = requestDouble({
      cookies: { [OAUTH_ORIGIN_COOKIE]: 'https://app.test' },
    });

    expect(readOAuthOrigin(req, allowed)).toBe('https://app.test');
  });

  it('falls back to the first origin when nothing was remembered', () => {
    expect(readOAuthOrigin(requestDouble(), allowed)).toBe(
      'http://localhost:3000',
    );
  });

  it('ignores a remembered origin that is no longer configured', () => {
    const req = requestDouble({
      cookies: { [OAUTH_ORIGIN_COOKIE]: 'https://evil.test' },
    });

    expect(readOAuthOrigin(req, allowed)).toBe('http://localhost:3000');
  });

  it('ignores a remembered value that is not an origin', () => {
    const req = requestDouble({
      cookies: { [OAUTH_ORIGIN_COOKIE]: '/../evil' },
    });

    expect(readOAuthOrigin(req, allowed)).toBe('http://localhost:3000');
  });
});

describe('OAuthOriginMiddleware', () => {
  function middleware(raw: string | undefined, nodeEnv = 'test') {
    const config = new ConfigService({
      FRONTEND_ORIGIN: raw,
      NODE_ENV: nodeEnv,
    });
    return new OAuthOriginMiddleware(config);
  }

  it('remembers the origin named in the query string', () => {
    const { res } = responseDouble();
    const next = vi.fn();

    middleware(TWO_ORIGINS).use(
      requestDouble({ query: { origin: 'https://app.test/login' } }),
      res as unknown as Response,
      next,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      OAUTH_ORIGIN_COOKIE,
      'https://app.test',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        maxAge: OAUTH_ORIGIN_MAX_AGE_MS,
      }),
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls back to the referring page for a plain link', () => {
    const { res } = responseDouble();

    middleware(TWO_ORIGINS).use(
      requestDouble({ referer: 'https://app.test/login' }),
      res as unknown as Response,
      vi.fn(),
    );

    expect(res.cookie).toHaveBeenCalledWith(
      OAUTH_ORIGIN_COOKIE,
      'https://app.test',
      expect.anything(),
    );
  });

  it('never remembers a host that is not configured — no open redirect', () => {
    const { res } = responseDouble();

    middleware(TWO_ORIGINS).use(
      requestDouble({
        query: { origin: 'https://evil.test' },
        referer: 'https://evil.test',
      }),
      res as unknown as Response,
      vi.fn(),
    );

    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('marks the cookie Secure in production', () => {
    const { res } = responseDouble();

    middleware('https://app.test', 'production').use(
      requestDouble({ referer: 'https://app.test/login' }),
      res as unknown as Response,
      vi.fn(),
    );

    expect(res.cookie).toHaveBeenCalledWith(
      OAUTH_ORIGIN_COOKIE,
      'https://app.test',
      expect.objectContaining({ secure: true }),
    );
  });
});

describe('clearOAuthOrigin', () => {
  it('clears the remembered origin on the same attributes it was set with', () => {
    const { res } = responseDouble();

    clearOAuthOrigin(res as unknown as Response, { secure: true });

    expect(res.clearCookie).toHaveBeenCalledWith(OAUTH_ORIGIN_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
  });
});
