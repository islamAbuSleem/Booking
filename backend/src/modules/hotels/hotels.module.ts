import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { CancellationsModule } from '../cancellations/cancellations.module.js';
import { HotelsController } from './hotels.controller.js';
import { HotelsService } from './hotels.service.js';
import { SitemapController } from './sitemap.controller.js';

/**
 * `BookingsModule` is imported, not reached into: T18 put the availability logic there and
 * the route lives here because the path is `/api/hotels/:id/availability`. `CancellationsModule`
 * follows the same rule for `/api/hotels/:id/cancellation-policy`. Services are consumed
 * through the modules' exported surfaces, as the module boundary rule requires.
 */
@Module({
  imports: [BookingsModule, CancellationsModule],
  controllers: [HotelsController, SitemapController],
  providers: [HotelsService],
  exports: [HotelsService],
})
export class HotelsModule {}
