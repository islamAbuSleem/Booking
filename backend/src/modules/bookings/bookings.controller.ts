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
import { Public } from '../../common/decorators/public.decorator.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import { AvailabilityService } from './availability.service.js';
import { BookingsService } from './bookings.service.js';
import {
  quoteRequestSchema,
  type QuoteData,
  type QuoteRequest,
} from './dto/availability.dto.js';
import {
  bookingIdParam,
  createBookingSchema,
  type BookingDto,
  type BookingIdParam,
  type BookingListData,
  type CreateBooking,
} from './dto/booking.dto.js';

/**
 * T18 + T20 — the bookings routes. Thin on purpose: parse, delegate.
 *
 * `quote` is public and creates nothing, so it answers 200 rather than the 201 a POST
 * creating a resource would. The matching availability read lives on the hotels
 * controller, because its route is `/api/hotels/:id/availability`.
 *
 * The four booking routes default to authenticated (no `@Public()`): the caller is the
 * JWT subject via `@CurrentUser('id')`, and no route reads a caller id from a body or a
 * query string, which is why none of them can be talked into another guest's rows.
 */
@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(
    @Inject(AvailabilityService)
    private readonly availability: AvailabilityService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
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
      'the PENDING booking, and `holdExpiresAt` is how long the guest has to get there: a ' +
      'hold only holds the room while that instant is still in the future.',
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

  @Post()
  @ApiOperation({
    summary: 'Book a room',
    description:
      'Creates the PENDING booking inside a serializable transaction that re-checks ' +
      'availability on the transaction client before the insert, so a concurrent booking ' +
      'for the last unit is answered ROOM_UNAVAILABLE rather than oversold. The money is ' +
      'a server-computed snapshot: the request carries no money fields, and a total sent ' +
      'in the body is stripped, never trusted (D3). The guest contact fields are ' +
      'validated but not persisted — the payment flow (T26/T27) is where they live. ' +
      'The booking embeds a hotel display snapshot so the detail page needs no second fetch.',
  })
  @ApiBody({ schema: { $ref: contractRef('CreateBooking') } })
  @ApiResponse({
    status: 201,
    description: 'The PENDING booking, with its money snapshot.',
    schema: { $ref: contractRef('BookingEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description:
      'The body failed validation, or the room sleeps fewer guests than asked ' +
      '(the 400 names the room limit).',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: "No such room, or the room's hotel is not published.",
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 409,
    description:
      'The room is sold out, blacked out, or too small for the party (ROOM_UNAVAILABLE).',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 422,
    description: 'The room has no price in the requested currency.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  create(
    @CurrentUser('id') callerId: string,
    @Body(zodPipe(createBookingSchema)) body: CreateBooking,
  ): Promise<BookingDto> {
    return this.bookings.create(callerId, body);
  }

  @Get()
  @ApiOperation({
    summary: "List the caller's bookings",
    description:
      "Only the caller's own rows, newest first: the read is filtered by the JWT subject " +
      'and no request field can widen it. A guest with no bookings gets an empty list, ' +
      'not an error.',
  })
  @ApiResponse({
    status: 200,
    description: "The caller's bookings, most recent first.",
    schema: { $ref: contractRef('BookingListEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  list(@CurrentUser('id') callerId: string): Promise<BookingListData> {
    return this.bookings.list(callerId);
  }

  @Get(':id')
  @ApiOperation({
    summary: "One of the caller's bookings",
    description:
      '404 BOOKING_NOT_FOUND when no such booking exists; 403 NOT_BOOKING_OWNER when it ' +
      'exists but belongs to a different guest. The 403 rather than a 404 is deliberate: ' +
      'a 404 would let a caller probe whether a booking id they do not own exists.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The booking, by uuid.',
  })
  @ApiResponse({
    status: 200,
    description: 'The booking, with its hotel snapshot.',
    schema: { $ref: contractRef('BookingEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'The booking exists but belongs to a different guest.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such booking.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  get(
    @CurrentUser('id') callerId: string,
    @Param(zodPipe(bookingIdParam)) params: BookingIdParam,
  ): Promise<BookingDto> {
    return this.bookings.get(callerId, params.id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Cancel the caller's booking",
    description:
      'Guarded to CONFIRMED only: a PENDING booking is an unpaid hold that T26/T27 ' +
      'confirm, and cancelling it out from under the payment would strand the money, so ' +
      'a PENDING booking answers INVALID_CANCEL_STATE until it is confirmed. Refunds are ' +
      'a later ticket; this flips the status only. Answers 200 with the booking in its ' +
      'CANCELLED state, not 204: the client renders the flip from the body.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The booking to cancel, by uuid.',
  })
  @ApiResponse({
    status: 200,
    description: 'The booking, now CANCELLED.',
    schema: { $ref: contractRef('BookingEnvelope') },
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
  @ApiResponse({
    status: 409,
    description:
      'The booking is not CONFIRMED (INVALID_CANCEL_STATE): PENDING until payment ' +
      'confirms it, and COMPLETED past cancelling.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  cancel(
    @CurrentUser('id') callerId: string,
    @Param(zodPipe(bookingIdParam)) params: BookingIdParam,
  ): Promise<BookingDto> {
    return this.bookings.cancel(callerId, params.id);
  }
}
