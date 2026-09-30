import { JWT_SECRET_PLACEHOLDER, parseEnv } from './env.js';

const JWT_SECRET = 'test-test-test-test-test-test-00';

describe('parseEnv', () => {
  it('fills the defaults for an empty environment', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgresql://user:pw@host/db',
      JWT_SECRET,
    });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      FRONTEND_ORIGIN: 'http://localhost:3000',
      LOG_LEVEL: 'log',
    });
    expect(env.DIRECT_URL).toBeUndefined();
  });

  it('coerces a string PORT', () => {
    expect(parseEnv({ DATABASE_URL: 'x', JWT_SECRET, PORT: '8080' }).PORT).toBe(
      8080,
    );
  });

  it('fails at boot when DATABASE_URL is missing', () => {
    expect(() => parseEnv({ JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('fails at boot when JWT_SECRET is missing', () => {
    expect(() =>
      parseEnv({ DATABASE_URL: 'postgresql://user:pw@host/db' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects a short JWT_SECRET', () => {
    expect(() => parseEnv({ DATABASE_URL: 'x', JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('refuses a wildcard CORS origin, because credentials are enabled', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'x',
        JWT_SECRET,
        FRONTEND_ORIGIN: '*',
      }),
    ).toThrow(/FRONTEND_ORIGIN/);
  });

  it('accepts a comma-separated origin list', () => {
    const env = parseEnv({
      DATABASE_URL: 'x',
      JWT_SECRET,
      FRONTEND_ORIGIN: 'https://a.test,https://b.test',
    });

    expect(env.FRONTEND_ORIGIN).toBe('https://a.test,https://b.test');
  });

  it('requires JWT_SECRET now that auth signs tokens (T14)', () => {
    // This replaced "allows an unset JWT_SECRET, because nothing signs anything
    // yet". T14 signs JWTs, so that premise is gone. Unset must fail at boot.
    expect(() => parseEnv({ DATABASE_URL: 'x' })).toThrow(/JWT_SECRET/);
  });

  it('refuses the .env.example JWT_SECRET placeholder at boot', () => {
    expect(() =>
      parseEnv({ DATABASE_URL: 'x', JWT_SECRET: JWT_SECRET_PLACEHOLDER }),
    ).toThrow(/JWT_SECRET/);
  });

  it('refuses a JWT_SECRET shorter than 32 characters', () => {
    expect(() =>
      parseEnv({ DATABASE_URL: 'x', JWT_SECRET: 'too-short' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('leaves OAuth secrets optional so tests build without providers', () => {
    const env = parseEnv({ DATABASE_URL: 'x', JWT_SECRET });

    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GITHUB_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CALLBACK_URL).toBe(
      'http://localhost:3000/api/auth/google/callback',
    );
    expect(env.GITHUB_CALLBACK_URL).toBe(
      'http://localhost:3000/api/auth/github/callback',
    );
  });
});
