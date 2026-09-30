import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service.js';
import { GithubStrategy } from './github.strategy.js';
import { GoogleStrategy } from './google.strategy.js';

function configWithoutSecrets(): ConfigService {
  return new ConfigService({});
}

describe('OAuth strategies (mocked, no secrets or network)', () => {
  it('builds without provider secrets', () => {
    const auth = {} as AuthService;

    expect(
      () => new GoogleStrategy(configWithoutSecrets(), auth),
    ).not.toThrow();
    expect(
      () => new GithubStrategy(configWithoutSecrets(), auth),
    ).not.toThrow();
  });

  it('Google validate resolves the profile to a session', async () => {
    const session = {
      user: {
        id: 'u-1',
        email: 'ada@example.com',
        name: 'Ada',
        avatarUrl: null,
        role: 'GUEST' as const,
      },
      token: 'token',
    };
    const validateOAuthProfile = vi.fn().mockResolvedValue(session);
    const auth = {
      validateOAuthProfile,
    } as unknown as AuthService;
    const strategy = new GoogleStrategy(configWithoutSecrets(), auth);
    const validate = strategy.validate.bind(strategy);

    const result = await validate('at', 'rt', {
      id: 'g-1',
      displayName: 'Ada',
      emails: [{ value: 'ada@example.com', verified: true }],
      photos: [{ value: 'https://img.test/a.png' }],
    } as never);

    expect(result).toBe(session);
    expect(validateOAuthProfile).toHaveBeenCalledWith({
      provider: 'google',
      providerId: 'g-1',
      email: 'ada@example.com',
      name: 'Ada',
      avatarUrl: 'https://img.test/a.png',
    });
  });

  it('GitHub validate resolves the profile to a session', async () => {
    const session = {
      user: {
        id: 'u-2',
        email: 'bo@example.com',
        name: 'Bo',
        avatarUrl: null,
        role: 'GUEST' as const,
      },
      token: 'token',
    };
    const validateOAuthProfile = vi.fn().mockResolvedValue(session);
    const auth = {
      validateOAuthProfile,
    } as unknown as AuthService;
    const strategy = new GithubStrategy(configWithoutSecrets(), auth);
    const validate = strategy.validate.bind(strategy);

    const result = await validate('at', 'rt', {
      id: 'gh-2',
      displayName: '',
      username: 'bo',
      emails: [{ value: 'bo@example.com' }],
      photos: [],
    } as never);

    expect(result).toBe(session);
    expect(validateOAuthProfile).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'github', providerId: 'gh-2' }),
    );
  });
});
