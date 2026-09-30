import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiHotelSearchQuery, contractRef } from './dto/hotel-search.api.js';
import {
  hotelIdParam,
  hotelSearchQuery,
  type HotelSearchQuery,
} from './dto/hotel-search-query.js';
import type { HotelDetailDto, HotelListDataDto } from './dto/hotel.dto.js';
import { HotelsService } from './hotels.service.js';

@Controller('hotels')
export class HotelsController {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(@Inject(HotelsService) private readonly hotels: HotelsService) {}

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
}
