import { Module } from '@nestjs/common';
import { FavoritesController } from './favorites.controller.js';
import { FavoritesService } from './favorites.service.js';

/**
 * T19 — owns the favourites writes. Nothing else imports it: the list route is out of
 * scope, so the service has no consumer outside this module and is not exported.
 */
@Module({
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
