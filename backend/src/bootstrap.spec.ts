import { describe, expect, it } from 'vitest';
import { allowedOrigins } from './modules/auth/oauth-origin.js';

describe('allowedOrigins', () => {
  it('falls back to the local frontend when the variable is absent', () => {
    expect(allowedOrigins(undefined)).toEqual(['http://localhost:3000']);
  });

  it('splits a comma-separated list and trims each entry', () => {
    expect(
      allowedOrigins('http://localhost:3000, https://staging.test'),
    ).toEqual(['http://localhost:3000', 'https://staging.test']);
  });

  it('never returns an empty list, so CORS is never left open', () => {
    expect(allowedOrigins(' , ')).toEqual(['http://localhost:3000']);
  });
});
