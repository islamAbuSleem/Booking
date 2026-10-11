import { Module } from '@nestjs/common';
import { CancellationsModule } from '../cancellations/cancellations.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { RefundsService } from './refunds.service.js';

/**
 * T38 — owns the refund rules.
 *
 * No controller here: the routes live on `BookingsController`, because their paths are
 * `/api/bookings/:id/...` and that controller already owns `/api/bookings`. It imports
 * this module to reach the exported service rather than reaching into it sideways.
 *
 * `PaymentsModule` is imported for the `STRIPE_CLIENT` boundary token and
 * `CancellationsModule` for the T37 quote — both consumed through their exported
 * surfaces, as the module boundary rule requires. Neither imports this module, so there
 * is no cycle.
 */
@Module({
  imports: [PaymentsModule, CancellationsModule],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
