import {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  DEFAULT_AUTH_COOKIE_MAX_AGE_MS,
  expiresInToMs,
  setAuthCookie,
} from './cookie.js';

describe('expiresInToMs', () => {
  it('parses jsonwebtoken forms into milliseconds', () => {
    expect(expiresInToMs('15m')).toBe(15 * 60 * 1000);
    expect(expiresInToMs('12h')).toBe(12 * 60 * 60 * 1000);
    expect(expiresInToMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(expiresInToMs('60')).toBe(60 * 1000);
    expect(expiresInToMs('3600s')).toBe(3600 * 1000);
  });

  it('falls back to 7 days for an unknown form', () => {
    expect(expiresInToMs('bogus')).toBe(DEFAULT_AUTH_COOKIE_MAX_AGE_MS);
  });
});

describe('auth cookies', () => {
  function responseDouble(): {
    res: {
      cookie: ReturnType<typeof vi.fn>;
      clearCookie: ReturnType<typeof vi.fn>;
    };
  } {
    return {
      res: { cookie: vi.fn(), clearCookie: vi.fn() },
    };
  }

  it('sets an httpOnly SameSite=Lax cookie with maxAge in MILLISECONDS', () => {
    const { res } = responseDouble();

    // 900_000 ms = 15 minutes. If this value were seconds, the cookie would
    // live ~28 years — the ms-vs-seconds trap from code-standards.md.
    setAuthCookie(res as never, 'token', 900_000, { secure: false });

    expect(res.cookie).toHaveBeenCalledWith(AUTH_COOKIE_NAME, 'token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 900_000,
      path: '/',
    });
  });

  it('marks the cookie Secure in production', () => {
    const { res } = responseDouble();

    setAuthCookie(res as never, 'token', 1000, { secure: true });

    expect(res.cookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      'token',
      expect.objectContaining({ secure: true }),
    );
  });

  it('clears the same cookie name and path', () => {
    const { res } = responseDouble();

    clearAuthCookie(res as never, { secure: false });

    expect(res.clearCookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      expect.objectContaining({ path: '/' }),
    );
  });
});
