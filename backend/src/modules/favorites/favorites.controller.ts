import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SkipEnvelope } from '../../common/envelope.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import {
  createFavoriteSchema,
  favoriteHotelIdParam,
  type CreateFavorite,
  type FavoriteDto,
  type FavoriteHotelIdParam,
} from './dto/favorite.dto.js';
import { FavoritesService } from './favorites.service.js';

/**
 * T19 — the favourites routes. Thin on purpose: parse, delegate.
 *
 * No `@Public()` on either: a favourite is an entry in a guest's own private list, and the
 * global `JwtAuthGuard` rejects an anonymous request with 401 before the handler runs. The
 * `userId` comes from `@CurrentUser('id')` — the JWT subject — and never from the body,
 * which is why neither handler can be talked into writing somebody else's row.
 */
@ApiTags('Favorites')
@Controller('favorites')
export class FavoritesController {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(
    @Inject(FavoritesService) private readonly favorites: FavoritesService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Favourite a hotel',
    description:
      'Creates the `favorites` row for the caller. The guest is the JWT subject: a `userId` ' +
      'in the body is stripped by the schema, never obeyed. A hotel that is already a ' +
      'favourite is a `FAVORITE_EXISTS` 409 rather than a second 201, because ' +
      '`(userId, hotelId)` is a composite primary key and a duplicate insert is a ' +
      'constraint violation worth surfacing. Clients call this optimistically and roll back ' +
      'on the 409.',
  })
  @ApiBody({ schema: { $ref: contractRef('CreateFavorite') } })
  @ApiResponse({
    status: 201,
    description: 'The row that was created.',
    schema: { $ref: contractRef('FavoriteEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The body failed validation — `hotelId` must be a uuid.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such hotel.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 409,
    description: 'Already a favourite (`FAVORITE_EXISTS`).',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  add(
    @CurrentUser('id') userId: string,
    @Body(zodPipe(createFavoriteSchema)) body: CreateFavorite,
  ): Promise<FavoriteDto> {
    return this.favorites.add(userId, body.hotelId);
  }

  @Delete(':hotelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipEnvelope()
  @ApiOperation({
    summary: 'Un-favourite a hotel',
    description:
      'Always 204, including when the caller never favourited that hotel: a toggle that ' +
      'fails on the second click shows an error for a state the guest caused on purpose. ' +
      "Only the caller's own row is touched, because the row is keyed by " +
      '`(userId, hotelId)` and `userId` is the JWT subject. An unknown `hotelId` is a 204 ' +
      'no-op too, so un-favouriting can never disagree with the toggle that called it.',
  })
  @ApiParam({
    name: 'hotelId',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The hotel to un-favourite, by uuid.',
  })
  @ApiNoContentResponse({
    description: 'Gone, or was never there. No body either way.',
  })
  @ApiResponse({
    status: 400,
    description: 'The path parameter is not a uuid.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  remove(
    @CurrentUser('id') userId: string,
    @Param(zodPipe(favoriteHotelIdParam)) params: FavoriteHotelIdParam,
  ): Promise<void> {
    return this.favorites.remove(userId, params.hotelId);
  }
}
