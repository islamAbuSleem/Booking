import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { ApiError } from '../../common/errors/api-error.js';
import type { PublicUser } from '../users/dto/user.dto.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../users/users.repository.js';
import { AUTH_COOKIE_NAME } from './cookie.js';

interface JwtPayload {
  sub: string;
}

/**
 * T14 — the global guard. Registered as an `APP_GUARD` so every route defaults
 * to authenticated; `@Public()` opts a route out.
 *
 * The token is read from the `access_token` httpOnly cookie first, then from
 * `Authorization: Bearer` for non-browser clients. A verified `sub` is
 * resolved to a fresh user row (so a role change takes effect immediately)
 * and attached as `request.user` for `@CurrentUser()` and `RolesGuard`.
 *
 * Every rejection is an `ApiError` with a stable machine-readable code — 401
 * `UNAUTHORIZED` for missing, invalid, or ownerless tokens, and 403
 * `ACCOUNT_SUSPENDED` for a valid token on a suspended account.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  // Every token is explicit (`@Inject`): tsx/esbuild never emits
  // `design:paramtypes` (see PrismaService), so inference would break the
  // OpenAPI preview with an `UndefinedDependencyException`.
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // T36 — the Socket.IO gateway authenticates its own handshake (same JWT cookie,
    // verified in the gateway): for a non-HTTP context `getRequest()` hands back the
    // socket, whose `.headers` is undefined, so this guard must not run there at all.
    // The `typeof` check keeps older unit specs (whose mock context has no `getType`)
    // on the HTTP path.
    const contextType =
      typeof context.getType === 'function' ? context.getType() : 'http';
    if (contextType !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: PublicUser }>();
    const token = readToken(request);
    if (!token) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Authentication required',
      );
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        issuer: this.config.get<string>('JWT_ISSUER') ?? 'booking-api',
        audience: this.config.get<string>('JWT_AUDIENCE') ?? 'booking-web',
      });
    } catch {
      // Never include the token or the verify detail: both leak.
      this.logger.warn('[auth] rejected invalid token');
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Invalid or expired token',
      );
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Invalid or expired token',
      );
    }

    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Invalid or expired token',
      );
    }

    // Suspension takes effect on the next request, not at token expiry: the guard
    // resolves a fresh row on every call, so a suspended account's live JWT dies here.
    // 403, not 401 — the token is valid, the account is not, and the client must offer
    // "contact support" rather than another login attempt.
    if (user.status === 'SUSPENDED') {
      this.logger.warn(`[auth] rejected suspended account ${user.id}`);
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_SUSPENDED',
        'This account has been suspended',
      );
    }

    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
    return true;
  }
}

export function readToken(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const fromCookie = cookies?.[AUTH_COOKIE_NAME];
  if (typeof fromCookie === 'string' && fromCookie.length > 0)
    return fromCookie;

  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token.length > 0) return token;
  }
  return undefined;
}
