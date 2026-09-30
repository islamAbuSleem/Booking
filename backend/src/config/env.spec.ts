import { JWT_SECRET_PLACEHOLDER, parseEnv } from './env.js';

describe('parseEnv', () => {
  it('fills the defaults for an empty environment', () => {
    const env = parseEnv({ DATABASE_URL: 'postgresql://user:pw@host/db' });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      FRONTEND_ORIGIN: 'http://localhost:3000',
      LOG_LEVEL: 'log',
    });
    expect(env.DIRECT_URL).toBeUndefined();
  });

  it('coerces a string PORT', () => {
    expect(parseEnv({ DATABASE_URL: 'x', PORT: '8080' }).PORT).toBe(8080);
  });

  it('fails at boot when DATABASE_URL is missing', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('refuses a wildcard CORS origin, because credentials are enabled', () => {
    expect(() => parseEnv({ DATABASE_URL: 'x', FRONTEND_ORIGIN: '*' })).toThrow(
      /FRONTEND_ORIGIN/,
    );
  });

  it('accepts a comma-separated origin list', () => {
    const env = parseEnv({
      DATABASE_URL: 'x',
      FRONTEND_ORIGIN: 'https://a.test,https://b.test',
    });

    expect(env.FRONTEND_ORIGIN).toBe('https://a.test,https://b.test');
  });

  it('allows an unset JWT_SECRET, because nothing signs anything yet', () => {
    expect(parseEnv({ DATABASE_URL: 'x' }).JWT_SECRET).toBeUndefined();
  });

  it('refuses the .env.example JWT_SECRET placeholder at boot', () => {
    expect(() =>
      parseEnv({ DATABASE_URL: 'x', JWT_SECRET: JWT_SECRET_PLACEHOLDER }),
    ).toThrow(/JWT_SECRET/);
  });

  it('refuses a JWT_SECRET shorter than 32 characters', () => {
    expect(() => parseEnv({ DATABASE_URL: 'x', JWT_SECRET: 'too-short' })).toThrow(
      /JWT_SECRET/,
    );
  });
});
