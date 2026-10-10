import { Module } from '@nestjs/common';
import { CancellationsModule } from '../cancellations/cancellations.module.js';
import { RefundsModule } from '../refunds/refunds.module.js';
import { AvailabilityService } from './availability.service.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

/**
 * T18 + T20 — owns the availability, quote and booking logic. The matching availability
 * read is routed from `HotelsController` (`GET /api/hotels/:id/availability`), which
 * imports this module to reach the exported service rather than reaching into it sideways.
 *
 * `BookingsService` is exported so the T38 cancel route can build its booking half
 * through the module that owns the hotel snapshot. `CancellationsModule` and
 * `RefundsModule` are imported for the cancellation-quote and refund routes, consumed
 * through their exported surfaces.
 */
@Module({
  imports: [CancellationsModule, RefundsModule],
  controllers: [BookingsController],
  providers: [AvailabilityService, BookingsService],
  exports: [AvailabilityService, BookingsService],
})
export class BookingsModule {}
