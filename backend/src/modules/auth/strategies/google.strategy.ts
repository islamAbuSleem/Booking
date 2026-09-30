import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';
import { AuthService, type OAuthProfile } from '../auth.service.js';

/**
 * T15 — Google OAuth.
 *
 * Expected callback URL (must be registered in the Google Cloud console for
 * manual verification):
 *
 *   http://localhost:3000/api/auth/google/callback            (local)
 *   https://<api-host>/api/auth/google/callback                (deployed)
 *
 * Override with `GOOGLE_CALLBACK_URL`. Client id/secret come from
 * `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and are optional at boot so the
 * app builds and tests pass without providers — only a real browser redirect
 * needs them. Tests mock this strategy (no secrets, no network).
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID') || 'test-google-id';
    const hasSecrets = Boolean(config.get<string>('GOOGLE_CLIENT_ID'));
    if (!hasSecrets) {
      // Never log the secret itself — only whether it was present.
      new Logger(GoogleStrategy.name).warn(
        '[auth] GOOGLE_CLIENT_ID missing — Google OAuth uses a placeholder and will fail at the provider',
      );
    }
    super({
      clientID,
      clientSecret:
        config.get<string>('GOOGLE_CLIENT_SECRET') || 'test-google-secret',
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') ||
        'http://localhost:3000/api/auth/google/callback',
      scope: ['email', 'profile'],
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
    const oauth: OAuthProfile = {
      provider: 'google',
      providerId: profile.id,
      email: profile.emails?.[0]?.value ?? '',
      name: profile.displayName || 'Google user',
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };
    // `validate` runs before the controller; returning the session makes it
    // `request.user` for the callback handler.
    return this.auth.validateOAuthProfile(oauth);
  }
}
