import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import {
  intentRequestSchema,
  paymentBookingParamSchema,
  type IntentData,
  type IntentRequest,
  type PaymentBookingParam,
  type PaymentDto,
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
}
