import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { HotelsController } from './hotels.controller.js';
import { HotelsService } from './hotels.service.js';

/**
 * `BookingsModule` is imported, not reached into: T18 put the availability logic there and
 * the route lives here because the path is `/api/hotels/:id/availability`. The service is
 * consumed through the module's exported surface, as the module boundary rule requires.
 */
@Module({
  imports: [BookingsModule],
  controllers: [HotelsController],
  providers: [HotelsService],
  exports: [HotelsService],
})
export class HotelsModule {}
