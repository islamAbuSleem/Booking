import { Module } from '@nestjs/common';
import { CancellationService } from './cancellations.service.js';

/**
 * T37 — owns the cancellation-policy rules. No controller here: the three routes live
 * where their authz already lives (hotels controller for the public read, host
 * controller for the owner-scoped write, bookings controller for the owner-scoped
 * quote), and each imports this module to reach the exported service rather than
 * reaching into it sideways.
 */
@Module({
  providers: [CancellationService],
  exports: [CancellationService],
})
export class CancellationsModule {}
