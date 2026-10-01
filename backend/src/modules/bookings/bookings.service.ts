import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ApiError,
  badRequest,
  notFound,
} from '../../common/errors/api-error.js';
import {
  AVAILABILITY_REPOSITORY,
  type AvailabilityRepository,
} from '../../prisma/availability.repository.js';
import {
  BOOKINGS_REPOSITORY,
  type BookingRecord,
  type BookingRepository,
} from '../../prisma/bookings.repository.js';
import { DEFAULT_CURRENCY } from '../../prisma/hotels.repository.js';
import {
  evaluateRoomAvailability,
  QUOTE_FEES_CENTS,
  stayNights,
} from './availability.service.js';
import {
  type BookingDto,
  type BookingListData,
  type CreateBooking,
} from './dto/booking.dto.js';

/**
 * T20 — the bookings rules. `create` is the load-bearing one: it pre-checks with T18's
 * math to give the guest a fast 409, then the repository's serializable transaction
 * re-checks on its own client before the insert, so a racing request is answered
 * `ROOM_UNAVAILABLE` rather than overselling the room.
 *
 * Every read is filtered by the caller's id, never by a request field (D4): a `get`, a
 * `list` and a `cancel` can only ever reach the caller's own rows.
 *
 * Depends on repository interfaces, never on `PrismaService` (context/code-standards.md,
 * "Dependency inversion"), so every rule below is testable with fakes and no database.
 */
@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @Inject(AVAILABILITY_REPOSITORY)
    private readonly availability: AvailabilityRepository,
    @Inject(BOOKINGS_REPOSITORY)
    private readonly bookings: BookingRepository,
  ) {}

  /**
   * `POST /api/bookings`. The money snapshot is computed here from the price read, never
   * read from the request: the body has no money fields at all, and the guest's
   * `guestName`/`guestEmail`/`guestPhone` are validated and dropped — the `bookings`
   * table has no columns for them, and T26/T27 are where the contact details land (D55).
   */
  async create(callerId: string, request: CreateBooking): Promise<BookingDto> {
    const room = await this.availability.findRoom(request.roomId);
    if (!room) throw notFound('ROOM_NOT_FOUND', 'Room not found');

    // A booking holds inventory on a published listing, so a draft hotel is a 404 for
    // everyone: the same visibility rule as the availability read. This is the create
    // half of closing the hole the public quote leaves (progress-tracker note).
    const hotel = await this.availability.findHotelRooms(room.hotelId);
    if (!hotel || hotel.status !== 'PUBLISHED') {
      throw notFound('HOTEL_NOT_FOUND', 'Hotel not found');
    }

    // Checked here rather than in the schema because the bound is per room, and a 400 with
    // the room's own limit is more use to a client than a generic validation failure.
    if (request.guests > room.maxGuests) {
      throw badRequest(`This room sleeps at most ${room.maxGuests} guest(s)`, {
        maxGuests: room.maxGuests,
        guests: request.guests,
      });
    }

    const currency =
      request.currency ??
      (await this.bookings.findRoomPriceCurrency(room.id)) ??
      DEFAULT_CURRENCY;

    const price = await this.availability.findRoomPrice(room.id, currency);
    if (!price) {
      // A missing price row is an error, never a silent zero (context/architecture.md,
      // "Pricing"). 422 because the request was well formed and the room exists — the
      // hotel simply has not priced it in the requested currency.
      throw new ApiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PRICE_UNAVAILABLE',
        `This room has no price in ${currency}`,
      );
    }

    // The pre-check is the fast path. The transaction below re-runs this math on its own
    // client, so this one exists to give the guest a 409 before a write is even attempted.
    const nights = stayNights(request.checkIn, request.checkOut);
    const [overlaps, blackouts] = await Promise.all([
      this.availability.findOverlappingBookings(
        [room.id],
        request.checkIn,
        request.checkOut,
      ),
      this.availability.findOverlappingBlackouts(
        room.hotelId,
        [room.id],
        request.checkIn,
        request.checkOut,
      ),
    ]);
    const { available } = evaluateRoomAvailability(
      room,
      nights,
      overlaps,
      blackouts,
      request.guests,
    );
    if (!available) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'ROOM_UNAVAILABLE',
        'The room is not available for those dates',
      );
    }

    const subtotalCents = price.amountCents * nights.length;
    const record = await this.bookings.createPending({
      guestId: callerId,
      roomId: room.id,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      guests: request.guests,
      currency: price.currency,
      subtotalCents,
      feesCents: QUOTE_FEES_CENTS,
      totalCents: subtotalCents + QUOTE_FEES_CENTS,
    });

    this.logger.log(
      `[bookings] created ${record.reference} for ${room.id}, ${nights.length} night(s) in ${price.currency}`,
    );
    return this.toDto(record);
  }

  /** `GET /api/bookings` — the caller's own rows, newest first. Nothing else's. */
  async list(callerId: string): Promise<BookingListData> {
    const records = await this.bookings.findForOwner(callerId);
    const items = await Promise.all(
      records.map((record) => this.toDto(record)),
    );
    return { items, total: items.length };
  }

  /** `GET /api/bookings/:id` — 404 when missing, 403 when it belongs to a different guest. */
  async get(callerId: string, bookingId: string): Promise<BookingDto> {
    const record = await this.loadOwnedBooking(callerId, bookingId);
    return this.toDto(record);
  }

  /**
   * `POST /api/bookings/:id/cancel`. Guarded to `CONFIRMED` only: a `PENDING` booking is
   * an unpaid hold, and cancelling it out from under T26's payment intent would strand
   * the money, so a fresh `PENDING` booking cannot be cancelled until T26 confirms it.
   * A refund is out of scope (T38); this only flips the status.
   */
  async cancel(callerId: string, bookingId: string): Promise<BookingDto> {
    const record = await this.loadOwnedBooking(callerId, bookingId);
    if (record.status !== 'CONFIRMED') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'INVALID_CANCEL_STATE',
        'Only a confirmed booking can be cancelled',
      );
    }

    const updated = await this.bookings.updateStatus(
      bookingId,
      callerId,
      'CONFIRMED',
      'CANCELLED',
    );
    if (!updated) {
      // Nothing matched, so the row moved between the read and the write. Re-read to
      // tell the two apart: gone is a 404, a state change is the same 409 as above.
      const current = await this.bookings.findById(bookingId);
      if (!current) throw notFound('BOOKING_NOT_FOUND', 'Booking not found');
      throw new ApiError(
        HttpStatus.CONFLICT,
        'INVALID_CANCEL_STATE',
        'Only a confirmed booking can be cancelled',
      );
    }

    this.logger.log(`[bookings] cancelled ${record.reference}`);
    return this.toDto(updated);
  }

  /**
   * The ownership rule, stated once: a missing row is a 404, an existing row that is not
   * the caller's is a 403 — never a 404, because a 404 would let a caller probe whether
   * a booking id they do not own exists.
   */
  private async loadOwnedBooking(
    callerId: string,
    bookingId: string,
  ): Promise<BookingRecord> {
    const record = await this.bookings.findById(bookingId);
    if (!record) throw notFound('BOOKING_NOT_FOUND', 'Booking not found');
    if (record.guestId !== callerId) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'NOT_BOOKING_OWNER',
        'This booking belongs to a different guest',
      );
    }
    return record;
  }

  private async toDto(record: BookingRecord): Promise<BookingDto> {
    const hotel = await this.bookings.findHotelSnapshot(record.hotelId);
    if (!hotel) {
      // The room was read moments before the write, so a missing hotel is a server state
      // error, not a caller error the guest can act on.
      throw new ApiError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'INTERNAL_ERROR',
        "The booking's hotel is missing",
      );
    }
    return {
      id: record.id,
      reference: record.reference,
      status: record.status,
      checkIn: record.checkIn,
      checkOut: record.checkOut,
      nights: record.nights,
      guestsCount: record.guestsCount,
      currency: record.currency,
      subtotalCents: record.subtotalCents,
      feesCents: record.feesCents,
      totalCents: record.totalCents,
      hotel: {
        id: hotel.id,
        slug: hotel.slug,
        name: hotel.name,
        city: hotel.city,
        country: hotel.country,
        addressLine: hotel.addressLine,
        coverImage: hotel.coverImage,
      },
      room: { name: record.roomName },
      createdAt: record.createdAt.toISOString(),
    };
  }
}
