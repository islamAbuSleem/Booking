import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { Request } from 'express';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import {
  intentRequestSchema,
  paymentBookingParamSchema,
  type IntentData,
  type IntentRequest,
  type PaymentBookingParam,
  type PaymentDto,
  type WebhookData,
} from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';

/**
 * T26 — the payment routes. Thin on purpose: parse, delegate.
 *
 * Both default to authenticated, and the caller is always the JWT subject. The request
 * carries a booking id and nothing else money-shaped: the amount comes from the
 * booking snapshot the server wrote, so there is no client-sent total to mistrust.
 */
@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  @Post('intent')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create the Stripe PaymentIntent for a pending booking',
    description:
      'Idempotent by construction: the Stripe idempotency key derives from the booking ' +
      'reference, so a retry is the same Stripe call rather than a second charge, and the ' +
      'single payment row is upserted. The browser confirms the returned `clientSecret` ' +
      'with Stripe.js; confirmation itself arrives via webhook in T27.',
  })
  @ApiBody({ schema: { $ref: contractRef('IntentRequest') } })
  @ApiResponse({
    status: 201,
    description: 'The intent to confirm, with the server-computed amount.',
    schema: { $ref: contractRef('IntentEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The body failed validation, or the booking is not PENDING.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'The booking belongs to a different guest.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such booking.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  createIntent(
    @CurrentUser('id') callerId: string,
    @Body(zodPipe(intentRequestSchema)) body: IntentRequest,
  ): Promise<IntentData> {
    return this.payments.createIntent(callerId, body);
  }

  @Get(':bookingId')
  @ApiOperation({ summary: 'Read the payment for a booking' })
  @ApiParam({
    name: 'bookingId',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The booking, by uuid.',
  })
  @ApiResponse({
    status: 200,
    description: 'The payment row, if an intent has been created.',
    schema: { $ref: contractRef('PaymentEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'The booking belongs to a different guest.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such booking, or no payment started for it yet.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  getPayment(
    @CurrentUser('id') callerId: string,
    @Param(zodPipe(paymentBookingParamSchema)) params: PaymentBookingParam,
  ): Promise<PaymentDto> {
    return this.payments.getPayment(callerId, params.bookingId);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stripe webhook: confirm or release a booking',
    description:
      'Signature-verified against the RAW body (`rawBody: true` at scaffold; never ' +
      '`@Body({ bodyParser: false })`, which does not exist, and never ' +
      '`app.use(express.json())`, which nulls `rawBody`). `payment_intent.succeeded` ' +
      'flips the booking PENDING → CONFIRMED and upserts the payment row with the ' +
      'receipt URL; `payment_intent.payment_failed` releases the hold (PENDING → ' +
      'CANCELLED). A late failure for an already-confirmed stay changes nothing. ' +
      'Unknown events 200 and are ignored, so a new Stripe event type never wedges ' +
      'deliveries into a retry loop. Fully idempotent: Stripe retries, and a repeated ' +
      'event finds nothing in `from` and writes nothing.',
  })
  @ApiResponse({
    status: 200,
    description: 'Accepted — verified and dispatched, or verified and ignored.',
    schema: { $ref: contractRef('WebhookEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The signature is missing or does not verify.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<WebhookData> {
    return this.payments
      .handleWebhook(req.rawBody, signature)
      .then(() => ({ received: true as const }));
  }
}
