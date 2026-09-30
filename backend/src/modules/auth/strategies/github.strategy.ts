import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-github2';
import { AuthService, type OAuthProfile } from '../auth.service.js';

/**
 * T15 — GitHub OAuth.
 *
 * Expected callback URL (must be registered in the GitHub OAuth app settings
 * for manual verification):
 *
 *   http://localhost:3000/api/auth/github/callback            (local)
 *   https://<api-host>/api/auth/github/callback                (deployed)
 *
 * Override with `GITHUB_CALLBACK_URL`. Client id/secret come from
 * `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` and are optional at boot so the
 * app builds and tests pass without providers — only a real browser redirect
 * needs them. Tests mock this strategy (no secrets, no network).
 */
@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {
    const clientID = config.get<string>('GITHUB_CLIENT_ID') || 'test-github-id';
    if (!config.get<string>('GITHUB_CLIENT_ID')) {
      new Logger(GithubStrategy.name).warn(
        '[auth] GITHUB_CLIENT_ID missing — GitHub OAuth uses a placeholder and will fail at the provider',
      );
    }
    super({
      clientID,
      clientSecret:
        config.get<string>('GITHUB_CLIENT_SECRET') || 'test-github-secret',
      callbackURL:
        config.get<string>('GITHUB_CALLBACK_URL') ||
        'http://localhost:3000/api/auth/github/callback',
      scope: ['user:email'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<{
    user: Awaited<ReturnType<AuthService['validateOAuthProfile']>>['user'];
    token: string;
  }> {
    const email =
      Array.isArray(profile.emails) && profile.emails.length > 0
        ? (profile.emails[0]?.value ?? '')
        : '';
    const oauth: OAuthProfile = {
      provider: 'github',
      providerId: profile.id,
      email,
      name: profile.displayName || profile.username || 'GitHub user',
      avatarUrl: (profile.photos?.[0]?.value as string | undefined) ?? null,
    };
    return this.auth.validateOAuthProfile(oauth);
  }
}
