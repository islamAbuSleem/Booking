import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { CancellationsModule } from '../cancellations/cancellations.module.js';

/**
 * T18 + T20 — owns the availability, quote and booking logic. The matching availability
 * read is routed from `HotelsController` (`GET /api/hotels/:id/availability`), which
 * imports this module to reach the exported service rather than reaching into it sideways.
 *
 * `BookingsService` is not exported: no other module has a route into the bookings writes,
 * and the repository bindings it needs are global (PrismaModule). `CancellationsModule`
 * is imported for the cancellation-quote route, consumed through its exported surface.
 */
@Module({
  imports: [CancellationsModule],
  controllers: [BookingsController],
  providers: [AvailabilityService, BookingsService],
  exports: [AvailabilityService],
})
export class BookingsModule {}
