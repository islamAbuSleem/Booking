import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError, notFound } from '../../common/errors/api-error.js';
import {
  FAVORITES_REPOSITORY,
  type FavoritesRepository,
} from '../../prisma/favorites.repository.js';
import type { FavoriteDto } from './dto/favorite.dto.js';

/**
 * T19 — favourites. Two writes and no reads: the ticket scopes the list route out, so there
 * is nothing here that lists a guest's favourites.
 *
 * Both methods take the caller's id as an argument and never read one from a request, so
 * there is no path by which one guest writes another guest's row. That is also why `remove`
 * needs no ownership check: the row is keyed by the pair, so deleting "my favourite of this
 * hotel" can only ever reach my row.
 *
 * The ticket promises both "the toggle is idempotent" and "409 on a duplicate insert", which
 * are different things. They are split here, and the sequence a client toggle is written
 * against is:
 *
 *     POST -> 201, POST -> 409, DELETE -> 204, DELETE -> 204, POST -> 201
 *
 * Depends on the `FAVORITES_REPOSITORY` token, never on `PrismaService`, so the rules below
 * are testable with a fake and no database (context/code-standards.md, "Dependency
 * inversion").
 */
@Injectable()
export class FavoritesService {
  private readonly logger = new Logger(FavoritesService.name);

  constructor(
    @Inject(FAVORITES_REPOSITORY)
    private readonly favorites: FavoritesRepository,
  ) {}

  /**
   * `POST /api/favorites`. The hotel is looked up first so a bad id is a `HOTEL_NOT_FOUND`,
   * the code the hotel routes already use, rather than the 400 the foreign key would give.
   */
  async add(userId: string, hotelId: string): Promise<FavoriteDto> {
    if (!(await this.favorites.hotelExists(hotelId))) {
      throw notFound('HOTEL_NOT_FOUND', 'Hotel not found');
    }

    const created = await this.favorites.create(userId, hotelId);
    // A duplicate is reported, not swallowed. Reporting 201 for the second POST would hide
    // the composite primary key doing the one job it exists for.
    if (!created) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'FAVORITE_EXISTS',
        'This hotel is already a favourite',
      );
    }

    this.logger.log(`[favorites] user favourited hotel ${hotelId}`);
    return {
      userId: created.userId,
      hotelId: created.hotelId,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * `DELETE /api/favorites/:hotelId`, always a 204.
   *
   * No hotel lookup here, unlike `add`: the row is the caller's own and is keyed by the
   * pair, so removing one that is not there — or a hotel id that never existed — is a no-op
   * rather than a 404. A 404 there would surface an error for a state the guest caused on
   * purpose by toggling twice.
   */
  async remove(userId: string, hotelId: string): Promise<void> {
    await this.favorites.remove(userId, hotelId);
  }
}
