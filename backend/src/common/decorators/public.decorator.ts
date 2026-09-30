import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/**
 * T14 — opts a route out of the global `JwtAuthGuard`.
 *
 * Register, login, health, public hotel reads and the OAuth entry/callback
 * routes are public; everything else defaults to authenticated.
 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
