import { SetMetadata } from '@nestjs/common';
import type { ErrorCode } from '../errors/api-error.js';
import type { UserRole } from '../../modules/users/users.repository.js';

/** T14 — route metadata read by `RolesGuard`. No metadata means any authenticated role. */
export const ROLES_KEY = 'roles';

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/**
 * T25 — the machine-readable code `RolesGuard` answers with on this route. Defaults to
 * `FORBIDDEN`; the admin controller sets `ADMIN_REQUIRED` so the client can tell "sign
 * in" (401) apart from "signed in as the wrong role" instead of rendering one login
 * wall for both.
 */
export const ROLES_CODE_KEY = 'rolesCode';

export const RolesCode = (code: ErrorCode): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_CODE_KEY, code);
