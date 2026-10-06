import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiError } from '../../common/errors/api-error.js';
import { toPublicUser, type PublicUser } from '../users/dto/user.dto.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../users/users.repository.js';
import { expiresInToMs } from './cookie.js';
import type { LoginInput, RegisterInput } from './dto/auth.dto.js';
import { PasswordService } from './password.service.js';

export interface Session {
  user: PublicUser;
  token: string;
}

export interface OAuthProfile {
  provider: 'google' | 'github';
  providerId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface JwtPayload {
  sub: string;
  email: string;
  role: PublicUser['role'];
}

/**
 * T14 + T15 — credentials, sessions, and OAuth linking.
 *
 * Thin in the Prisma sense: every database read/write goes through the
 * `USERS_REPOSITORY` token, never through `PrismaService`, so every rule
 * below is unit-testable with a stub.
 *
 * Security rules, all load-bearing:
 *   * Register hashes with Argon2id; login verifies with it. No bcrypt anywhere.
 *   * A missing user and a wrong password both cost ~one verify and both
 *     throw the same `INVALID_CREDENTIALS` 401, so timing and codes never leak
 *     whether the email exists.
 *   * An OAuth-only account (null `passwordHash`) cannot log in with a
 *     password — it runs the dummy verify and gets the same 401.
 *   * A successful login rehashes opportunistically via `needsRehash`.
 *   * Nothing here logs a token, a password, or a secret — only user ids.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Every token is explicit (`@Inject`) rather than inferred, because the
  // OpenAPI preview runs under tsx/esbuild, which never emits
  // `design:paramtypes` — inferred injection silently resolves to undefined
  // there (see PrismaService). Explicit tokens work on every transform.
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async register(input: RegisterInput): Promise<Session> {
    const email = input.email;
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'EMAIL_TAKEN',
        'That email is already registered',
      );
    }

    const passwordHash = await this.passwords.hash(input.password);
    const created = await this.users.create({
      email,
      name: input.name,
      passwordHash,
      role: input.wantsToHost ? 'HOST' : 'GUEST',
    });
    this.logger.log(`[auth] registered ${created.id} role=${created.role}`);

    const token = await this.signToken(created.id, created.email, created.role);
    return { user: toPublicUser(created), token };
  }

  async login(input: LoginInput): Promise<Session> {
    const user = await this.users.findByEmail(input.email);
    if (!user || !user.passwordHash) {
      // Same cost as a real verify, same error as a wrong password: the
      // caller learns nothing about whether the email exists or whether the
      // account is OAuth-only.
      await this.passwords.dummyVerify();
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Invalid email or password',
      );
    }

    const ok = await this.passwords.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Invalid email or password',
      );
    }

    this.ensureActive(user);

    await this.rehashIfNeeded(user.id, user.passwordHash, input.password);

    this.logger.log(`[auth] login ${user.id}`);
    const token = await this.signToken(user.id, user.email, user.role);
    return { user: toPublicUser(user), token };
  }

  /**
   * T15 — resolves an OAuth profile to exactly one account.
   *
   * Lookup order:
   *   1. The provider tuple `(provider, providerId)` — a returning OAuth user.
   *   2. The email — an existing password or unlinked account, which is then
   *      LINKED (the tuple is written onto it) rather than duplicated. An
   *      account that already carries a link is left alone: the tuple is never
   *      overwritten (see below).
   *   3. Otherwise a new `GUEST` account with no password hash.
   *
   * Email is unique across providers (the schema enforces it), so one person
   * stays one account however many providers they connect.
   *
   * One account holds ONE provider tuple (`users.oauth_provider` /
   * `oauth_account_id` are a single nullable pair), so linking on a second
   * provider has nowhere to go but over the first. That is a silent lockout
   * for the user (Google works today, GitHub tomorrow, Google never again) and
   * an account-claim for anyone who controls an address the victim also uses,
   * so an existing link is a 409 and the user signs in with the provider they
   * already linked.
   */
  async validateOAuthProfile(profile: OAuthProfile): Promise<Session> {
    const email = profile.email.trim().toLowerCase();
    if (!email) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        'OAUTH_FAILED',
        'The provider did not return an email address',
      );
    }

    const byOAuth = await this.users.findByOAuth(
      profile.provider,
      profile.providerId,
    );
    if (byOAuth) {
      this.logger.log(`[auth] oauth returning ${byOAuth.id}`);
      this.ensureActive(byOAuth);
      const token = await this.signToken(
        byOAuth.id,
        byOAuth.email,
        byOAuth.role,
      );
      return { user: toPublicUser(byOAuth), token };
    }

    const byEmail = await this.users.findByEmail(email);
    if (byEmail) {
      // Only a complete link blocks a new one; a half-written pair (provider
      // without account id) is a broken row, and the incoming tuple repairs it.
      if (byEmail.oauthProvider && byEmail.oauthAccountId) {
        if (
          byEmail.oauthProvider === profile.provider &&
          byEmail.oauthAccountId === profile.providerId
        ) {
          this.logger.log(`[auth] oauth returning ${byEmail.id}`);
          this.ensureActive(byEmail);
          const token = await this.signToken(
            byEmail.id,
            byEmail.email,
            byEmail.role,
          );
          return { user: toPublicUser(byEmail), token };
        }
        this.logger.warn(
          `[auth] oauth link refused for ${byEmail.id}: already linked to ${byEmail.oauthProvider}`,
        );
        throw new ApiError(
          HttpStatus.CONFLICT,
          'OAUTH_LINK_CONFLICT',
          'This account is already linked to a different sign-in method',
        );
      }

      this.ensureActive(byEmail);
      const linked = await this.users.update(byEmail.id, {
        oauthProvider: profile.provider,
        oauthAccountId: profile.providerId,
        ...(byEmail.avatarUrl ? {} : { avatarUrl: profile.avatarUrl }),
      });
      this.logger.log(`[auth] oauth linked ${linked.id}`);
      const token = await this.signToken(linked.id, linked.email, linked.role);
      return { user: toPublicUser(linked), token };
    }

    const created = await this.users.create({
      email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      role: 'GUEST',
      oauthProvider: profile.provider,
      oauthAccountId: profile.providerId,
    });
    this.logger.log(`[auth] oauth created ${created.id}`);
    const token = await this.signToken(created.id, created.email, created.role);
    return { user: toPublicUser(created), token };
  }

  /** Used by the JWT guard to turn a verified `sub` into a request user. */
  async findSessionUser(id: string): Promise<PublicUser | null> {
    const user = await this.users.findById(id);
    return user ? toPublicUser(user) : null;
  }

  /**
   * Suspension stops auth, not the row. Checked after the credential verifies (so the
   * answer never leaks whether the email exists) and before any token is signed — in
   * `login` and on every OAuth path that returns an existing account.
   */
  private ensureActive(user: { id: string; status: string }): void {
    if (user.status !== 'SUSPENDED') return;
    this.logger.warn(`[auth] refused suspended account ${user.id}`);
    throw new ApiError(
      HttpStatus.FORBIDDEN,
      'ACCOUNT_SUSPENDED',
      'This account has been suspended',
    );
  }

  private async signToken(
    sub: string,
    email: string,
    role: PublicUser['role'],
  ): Promise<string> {
    const payload: JwtPayload = { sub, email, role };
    // `expiresIn` is passed as seconds (a number) rather than the raw
    // `JWT_EXPIRES_IN` string: jsonwebtoken's `StringValue` template type does
    // not accept a widened `string`, and parsing here keeps the token lifetime
    // exactly equal to the cookie lifetime in `cookie.ts`.
    const expiresIn = Math.floor(
      expiresInToMs(this.config.get<string>('JWT_EXPIRES_IN') ?? '7d') / 1000,
    );
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn,
      issuer: this.config.get<string>('JWT_ISSUER') ?? 'booking-api',
      audience: this.config.get<string>('JWT_AUDIENCE') ?? 'booking-web',
    });
  }

  private async rehashIfNeeded(
    id: string,
    hash: string,
    password: string,
  ): Promise<void> {
    if (!this.passwords.needsRehash(hash)) return;
    try {
      const next = await this.passwords.hash(password);
      await this.users.update(id, { passwordHash: next });
      this.logger.log(`[auth] rehashed ${id}`);
    } catch {
      // A rehash failure must never fail the login that triggered it: the
      // old hash still verifies, so the user simply tries again next time.
      this.logger.warn(`[auth] rehash failed for ${id}`);
    }
  }
}
