import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../modules/users/users.repository.js';

/** T14 — route metadata read by `RolesGuard`. No metadata means any authenticated role. */
export const ROLES_KEY = 'roles';

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
