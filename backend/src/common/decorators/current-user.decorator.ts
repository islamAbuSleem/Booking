import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PublicUser } from '../../modules/users/dto/user.dto.js';

/**
 * T14 — reads the authenticated user the global `JwtAuthGuard` attached to
 * `request.user`. With a key (`@CurrentUser('id')`) returns that property,
 * otherwise the whole user. Never contains a password hash or a token.
 */
export const CurrentUser = createParamDecorator(
  (
    key: keyof PublicUser | undefined,
    context: ExecutionContext,
  ): PublicUser | PublicUser[keyof PublicUser] | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: PublicUser }>();
    const user = request.user;
    if (!user) return undefined;
    if (key) return user[key];
    return user;
  },
);
