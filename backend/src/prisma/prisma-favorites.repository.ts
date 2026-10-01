import { Inject, Injectable } from '@nestjs/common';
import { isPrismaKnownError } from '../common/errors/prisma-error.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  type FavoriteRecord,
  type FavoritesRepository,
} from './favorites.repository.js';
import { PrismaService } from './prisma.service.js';

/** Only the columns the 201 response exposes. */
const FAVORITE_SELECT = {
  userId: true,
  hotelId: true,
  createdAt: true,
} satisfies Prisma.FavoriteSelect;

/**
 * T19 — Prisma implementation of `FavoritesRepository`.
 *
 * The duplicate insert is recognised HERE rather than in the service, so the Prisma error
 * code never leaves this file. The generic `translatePrismaError` is deliberately not used:
 * it maps every `P2002` to an anonymous `CONFLICT`, and this ticket needs the client to be
 * able to tell "already a favourite" from any other conflict.
 */
export function isDuplicateFavoriteError(error: unknown): boolean {
  return isPrismaKnownError(error) && error.code === 'P2002';
}

@Injectable()
export class PrismaFavoritesRepository implements FavoritesRepository {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`, so an
  // inferred token would be undefined in the OpenAPI preview (see PrismaService).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async hotelExists(hotelId: string): Promise<boolean> {
    // `count`, not the row: the caller only asks whether the hotel exists and reads nothing
    // else about it.
    const found = await this.prisma.hotel.count({ where: { id: hotelId } });
    return found > 0;
  }

  async create(
    userId: string,
    hotelId: string,
  ): Promise<FavoriteRecord | null> {
    try {
      return await this.prisma.favorite.create({
        data: { userId, hotelId },
        select: FAVORITE_SELECT,
      });
    } catch (error) {
      if (isDuplicateFavoriteError(error)) return null;
      throw error;
    }
  }

  async remove(userId: string, hotelId: string): Promise<void> {
    // `deleteMany`, never `delete`: `delete` raises P2025 when the row is missing, which
    // the exception filter would turn into a 404 — exactly the error a toggle must not show
    // for un-favouriting something that was never favourited.
    await this.prisma.favorite.deleteMany({ where: { userId, hotelId } });
  }
}
