/**
 * T14 — the users read/write contract, expressed in domain terms.
 *
 * The auth service and the users service talk to this interface, never to
 * `PrismaService` (context/code-standards.md, "Dependency inversion"): auth
 * rules are then testable with a stub and no database. `PrismaUsersRepository`
 * is the one implementation, and it is the only place a Prisma type appears.
 */

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

/** Mirrors the `users.role` enum without importing a Prisma type into the contract. */
export type UserRole = 'GUEST' | 'HOST' | 'ADMIN';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  /** Null for OAuth-only accounts (T15). */
  passwordHash: string | null;
  role: UserRole;
  oauthProvider: string | null;
  oauthAccountId: string | null;
  createdAt: Date;
}

export interface CreateUserData {
  email: string;
  name: string;
  avatarUrl?: string | null;
  passwordHash?: string | null;
  role: UserRole;
  oauthProvider?: string | null;
  oauthAccountId?: string | null;
}

export interface UpdateUserData {
  name?: string;
  avatarUrl?: string | null;
  passwordHash?: string | null;
  role?: UserRole;
  oauthProvider?: string | null;
  oauthAccountId?: string | null;
}

export interface UsersRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  /** The T15 lookup key: the provider's tuple, not the email. */
  findByOAuth(provider: string, accountId: string): Promise<UserRecord | null>;
  create(data: CreateUserData): Promise<UserRecord>;
  update(id: string, patch: UpdateUserData): Promise<UserRecord>;
}
