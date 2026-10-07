import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerStorageService } from '@nestjs/throttler';
import type { PublicUser } from '../../modules/users/dto/user.dto.js';

/**
 * T29 — the one throttle guard, behind the ticket's three tiers.
 *
 * Tiers live on the routes (`@Throttle({ default: … })` overrides; `@SkipThrottle()`
 * opts out), but the *tracker* lives here: an authenticated caller is keyed by user
 * id, everyone else by IP. That is what makes the auth tier per-IP (no session exists
 * yet) and the booking/payment mutation tier per-user.
 *
 * Order matters: this guard runs AFTER `JwtAuthGuard` in `configureApp`, so
 * `request.user` is already the fresh row when an authenticated route is checked. A
 * request that reaches here unauthenticated is simply tracked by IP.
 */

export const AUTH_THROTTLE = { limit: 5, ttl: 15 * 60 * 1000 } as const;
export const MUTATION_THROTTLE = { limit: 20, ttl: 60 * 1000 } as const;
/** Everything not otherwise decorated. Generous on purpose: reads are cheap. */
export const READ_THROTTLE = { limit: 120, ttl: 60 * 1000 } as const;

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req['user'] as PublicUser | undefined;
    if (user && typeof user.id === 'string' && user.id.length > 0) {
      return `user:${user.id}`;
    }
    return super.getTracker(req as Record<string, unknown>);
  }
}

/** In-memory hit store. Single instance per process; distributed limiting is out of scope. */
export function createThrottleStorage(): ThrottlerStorageService {
  return new ThrottlerStorageService();
}
