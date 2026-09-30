import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CreateUserData,
  type UpdateUserData,
  type UserRecord,
  type UsersRepository,
} from './users.repository.js';

/**
 * T14 — Prisma implementation of `UsersRepository`.
 *
 * The only place a Prisma `User` type appears for this domain. Callers get
 * `UserRecord`, a plain interface with no Prisma import.
 */
@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async findByOAuth(
    provider: string,
    accountId: string,
  ): Promise<UserRecord | null> {
    // Prisma names the compound unique by its fields, not by the `map` name
    // in the schema (`users_oauth_account_key` is the Postgres constraint).
    const row = await this.prisma.user.findUnique({
      where: {
        oauthProvider_oauthAccountId: {
          oauthProvider: provider,
          oauthAccountId: accountId,
        },
      },
    });
    return row ? toRecord(row) : null;
  }

  async create(data: CreateUserData): Promise<UserRecord> {
    const row = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl ?? null,
        passwordHash: data.passwordHash ?? null,
        role: data.role,
        oauthProvider: data.oauthProvider ?? null,
        oauthAccountId: data.oauthAccountId ?? null,
      },
    });
    return toRecord(row);
  }

  async update(id: string, patch: UpdateUserData): Promise<UserRecord> {
    const row = await this.prisma.user.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.avatarUrl !== undefined
          ? { avatarUrl: patch.avatarUrl }
          : {}),
        ...(patch.passwordHash !== undefined
          ? { passwordHash: patch.passwordHash }
          : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.oauthProvider !== undefined
          ? { oauthProvider: patch.oauthProvider }
          : {}),
        ...(patch.oauthAccountId !== undefined
          ? { oauthAccountId: patch.oauthAccountId }
          : {}),
      },
    });
    return toRecord(row);
  }
}

interface PrismaUserRow {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  passwordHash: string | null;
  role: 'GUEST' | 'HOST' | 'ADMIN';
  oauthProvider: string | null;
  oauthAccountId: string | null;
  createdAt: Date;
}

function toRecord(row: PrismaUserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    passwordHash: row.passwordHash,
    role: row.role,
    oauthProvider: row.oauthProvider,
    oauthAccountId: row.oauthAccountId,
    createdAt: row.createdAt,
  };
}
