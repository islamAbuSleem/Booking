import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import { AvailabilityService } from './availability.service.js';
import {
  quoteRequestSchema,
  type QuoteData,
  type QuoteRequest,
} from './dto/availability.dto.js';

/**
 * T18 — the bookings routes. Thin on purpose: parse, delegate.
 *
 * `quote` is public and creates nothing, so it answers 200 rather than the 201 a POST
 * creating a resource would. The matching read lives on the hotels controller, because the
 * route is `/api/hotels/:id/availability`.
 */
@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(
    @Inject(AvailabilityService)
    private readonly availability: AvailabilityService,
  ) {}

  @Post('quote')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Price a stay and check it is bookable',
    description:
      'Server-side arithmetic only: the client-sent total is never trusted (D3). Availability ' +
      'is decided before the price is read, so a sold-out room never leaks a price, and a ' +
      'room with no `room_prices` row in the requested currency is a `PRICE_UNAVAILABLE` ' +
      'error rather than a free stay. Writes nothing — the inventory is held when T20 writes ' +
      'the PENDING booking, and `holdExpiresAt` is how long the guest has to get there.',
  })
  @ApiResponse({
    status: 200,
    description: 'The per-night breakdown and the totals, in integer cents.',
    schema: { $ref: contractRef('QuoteEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description:
      'The body failed validation, or the room sleeps fewer guests than asked.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such room.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 409,
    description: 'The room is sold out or blacked out for those dates.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 422,
    description: 'The room has no price in the requested currency.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  quote(
    @Body(zodPipe(quoteRequestSchema)) body: QuoteRequest,
  ): Promise<QuoteData> {
    return this.availability.quote(body);
  }
}
