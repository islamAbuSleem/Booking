import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AvailabilityService } from '../bookings/availability.service.js';
import { ApiAvailabilityQuery } from '../bookings/dto/availability.api.js';
import {
  availabilityQuerySchema,
  type AvailabilityQuery,
  type HotelAvailabilityData,
} from '../bookings/dto/availability.dto.js';
import { ApiHotelSearchQuery, contractRef } from './dto/hotel-search.api.js';
import {
  hotelIdParam,
  hotelSearchQuery,
  type HotelSearchQuery,
} from './dto/hotel-search-query.js';
import type { HotelDetailDto, HotelListDataDto } from './dto/hotel.dto.js';
import { HotelsService } from './hotels.service.js';
import { CancellationService } from '../cancellations/cancellations.service.js';
import type { PolicyDto } from '../cancellations/dto/cancellation.dto.js';

@Controller('hotels')
export class HotelsController {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(
    @Inject(HotelsService) private readonly hotels: HotelsService,
    @Inject(AvailabilityService)
    private readonly availability: AvailabilityService,
    @Inject(CancellationService)
    private readonly cancellations: CancellationService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Search published hotels',
    description:
      'Only PUBLISHED hotels are ever returned — the filter is in SQL, so a non-published ' +
      'row cannot leak through a page boundary. Prices are the cheapest room that fits ' +
      '`guests`, in the requested currency. Dates are accepted and validated here; ' +
      'availability filtering lands with the quote endpoint in T18.',
  })
  @ApiHotelSearchQuery()
  @ApiResponse({
    status: 200,
    description:
      'A page of hotels. `items` is empty and `total` is 0 when nothing matches.',
    schema: { $ref: contractRef('HotelListEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The query string failed validation.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  findAll(
    @Query(zodPipe(hotelSearchQuery)) query: HotelSearchQuery,
  ): Promise<HotelListDataDto> {
    return this.hotels.findAll(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'Hotel detail',
    description:
      'Resolves by uuid or by slug — the frontend links to `/hotels/{slug}`. A hotel that is ' +
      'not PUBLISHED is a 404 for everyone but its own host, so the endpoint cannot be used ' +
      'to discover a draft listing.',
  })
  @ApiResponse({
    status: 200,
    description:
      'The hotel, with rooms, amenities, images and a review summary.',
    schema: { $ref: contractRef('HotelDetailEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such hotel, or it is not visible to this caller.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  findOne(
    @Param(zodPipe(hotelIdParam)) params: { id: string },
  ): Promise<HotelDetailDto> {
    return this.hotels.findOne(params.id);
  }

  @Get(':id/availability')
  @Public()
  @ApiOperation({
    summary: 'Per-room availability for a date range',
    description:
      'One verdict per room, not a filtered list: the client renders a card for every room ' +
      'and marks the unavailable ones. A room is available when it sleeps the party AND ' +
      'every night has at least one unit left AND no blackout covers that night — a room at ' +
      'exact fit is NOT available, because the last unit taken leaves nothing to sell. ' +
      'A `PENDING` booking holds inventory exactly like a `CONFIRMED` one, since that is ' +
      'how a guest checkout holds a room before payment.',
  })
  @ApiAvailabilityQuery()
  @ApiResponse({
    status: 200,
    description:
      'Every room of the hotel, each with `available` and the units left on each night.',
    schema: { $ref: contractRef('HotelAvailabilityEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The query string failed validation.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such hotel, or it is not visible to this caller.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  findAvailability(
    @Param(zodPipe(hotelIdParam)) params: { id: string },
    @Query(zodPipe(availabilityQuerySchema)) query: AvailabilityQuery,
  ): Promise<HotelAvailabilityData> {
    return this.availability.hotelAvailability(params.id, query);
  }

  @Get(':id/cancellation-policy')
  @Public()
  @ApiOperation({
    summary: 'The hotel\u2019s cancellation policy',
    description:
      'The stored policy, or the API default when the hotel has none — never ' +
      '"no policy". Resolves by uuid or by slug, like the detail route, so the ' +
      'guest-facing table and the booking quote read the same row.',
  })
  @ApiResponse({
    status: 200,
    description: 'The policy, with its version.',
    schema: { $ref: contractRef('CancellationPolicyEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such hotel.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async findCancellationPolicy(
    @Param(zodPipe(hotelIdParam)) params: { id: string },
  ): Promise<PolicyDto> {
    const hotel = await this.hotels.findOne(params.id);
    return this.cancellations.getPolicy(hotel.id);
  }
}
