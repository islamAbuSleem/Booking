import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { STRIPE_CLIENT, StripePaymentClient } from './stripe.client.js';
import { PrismaPaymentsRepository } from '../../prisma/prisma-payments.repository.js';
import { PAYMENTS_REPOSITORY } from '../../prisma/payments.repository.js';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    { provide: PAYMENTS_REPOSITORY, useClass: PrismaPaymentsRepository },
    { provide: STRIPE_CLIENT, useClass: StripePaymentClient },
  ],
  exports: [PaymentsService, PAYMENTS_REPOSITORY, STRIPE_CLIENT],
})
export class PaymentsModule {}
