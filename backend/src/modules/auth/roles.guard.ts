import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import { ApiError } from '../../common/errors/api-error.js';
import type { PublicUser } from '../users/dto/user.dto.js';
import type { UserRole } from '../users/users.repository.js';

/**
 * T14 — role checks. Runs after the global `JwtAuthGuard`, so `request.user`
 * is already the fresh user row. A route with no `@Roles()` accepts any
 * authenticated role; `@Roles('HOST')` accepts hosts and admins only when
 * listed — membership is exact, there is no hierarchy.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: PublicUser }>();
    const user = request.user;
    if (!user) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Authentication required',
      );
    }
    if (!required.includes(user.role)) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Insufficient role',
      );
    }
    return true;
  }
}
