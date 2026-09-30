import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service.js';
import { BookingsController } from './bookings.controller.js';

/**
 * T18 — owns the availability and quote logic. The matching read is routed from
 * `HotelsController` (`GET /api/hotels/:id/availability`), which imports this module to reach
 * the exported service rather than reaching into it sideways.
 */
@Module({
  controllers: [BookingsController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class BookingsModule {}
