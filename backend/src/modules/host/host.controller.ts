import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Body,
  Inject,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import { SkipEnvelope } from '../../common/envelope.js';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import {
  createHotelSchema,
  updateHotelSchema,
  createRoomSchema,
  updateRoomSchema,
  createBlackoutSchema,
  type CreateHotelDto,
  type UpdateHotelDto,
  type HostHotelDetailDto,
  type HostHotelListDataDto,
  type RoomDetailDto,
  type CreateRoomDto,
  type UpdateRoomDto,
  type CreateBlackoutDto,
  type BlackoutDateDto,
  type HostBookingListDataDto,
  type CreateHotelData,
} from './dto/host.api.js';
import { HostService } from './host.service.js';

@ApiTags('Host')
@ApiBearerAuth()
@Controller('host/hotels')
@Roles('HOST', 'ADMIN')
export class HostController {
  constructor(
    @Inject(HostService) private readonly host: HostService,
  ) {}

  // --- Hotels list ---

  @Get()
  @ApiOperation({
    summary: 'List my hotels',
    description: 'Returns all hotels owned by the authenticated host, regardless of status.',
  })
  @ApiResponse({
    status: 200,
    description: 'A page of hotels with status badges and upcoming booking counts.',
    schema: { $ref: contractRef('HostHotelListEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Not a host or admin.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async listMyHotels(
    @CurrentUser('id') hostId: string,
  ): Promise<HostHotelListDataDto> {
    return this.host.listMyHotels(hostId);
  }

  // --- Bookings (must come before :id to avoid route shadowing) ---

  @Get('bookings')
  @ApiOperation({
    summary: 'List incoming bookings for my hotels',
    description: 'Returns all bookings (PENDING, CONFIRMED, COMPLETED, CANCELLED) for rooms in hotels owned by the authenticated host.',
  })
  @ApiResponse({
    status: 200,
    description: 'A page of bookings with hotel, room, guest and price snapshot.',
    schema: { $ref: contractRef('HostBookingListEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Not a host or admin.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async listMyBookings(
    @CurrentUser('id') hostId: string,
  ): Promise<HostBookingListDataDto> {
    return this.host.listMyBookings(hostId);
  }

  // --- Hotel CRUD ---

  @Post()
  @ApiOperation({
    summary: 'Create a new hotel listing',
    description: 'Creates a hotel in PENDING status. Admin approval required to publish.',
  })
  @ApiResponse({
    status: 201,
    description: 'The created hotel with its rooms, images and amenities (empty initially).',
    schema: { $ref: contractRef('HostHotelEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Not a host or admin.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async createHotel(
    @CurrentUser('id') hostId: string,
    @Body(zodPipe(createHotelSchema)) data: CreateHotelDto,
  ): Promise<HostHotelDetailDto> {
    return this.host.createHotel(hostId, data as unknown as CreateHotelData);
  }

  // --- Bookings ---

  /**
   * Declared *before* `@Get(':id')` on purpose. Nest registers routes in method-declaration
   * order and Express matches in that order too, so a literal path segment declared after a
   * `:id` param is unreachable: `/host/hotels/bookings` would be dispatched to
   * `getMyHotel('bookings', hostId)` and fail the uuid filter. Any new literal segment under
   * this prefix belongs above the `:id` handlers.
   */
  @Get('bookings')
  @ApiOperation({
    summary: 'List incoming bookings for my hotels',
    description: 'Returns all bookings (PENDING, CONFIRMED, COMPLETED, CANCELLED) for rooms in hotels owned by the authenticated host.',
  })
  @ApiResponse({
    status: 200,
    description: 'A page of bookings with hotel, room, guest and price snapshot.',
    schema: { $ref: contractRef('HostBookingListEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Not a host or admin.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async listMyBookings(
    @CurrentUser('id') hostId: string,
  ): Promise<HostBookingListDataDto> {
    return this.host.listMyBookings(hostId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get my hotel detail',
    description: 'Returns the full hotel detail including rooms, images, amenities and blackout dates. Only accessible by the owning host.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The hotel, by uuid or slug.',
  })
  @ApiResponse({
    status: 200,
    description: 'Full hotel detail.',
    schema: { $ref: contractRef('HostHotelEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Not a host/admin, or not the owner.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'Hotel not found or not owned by this host.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async getMyHotel(
    @CurrentUser('id') hostId: string,
    @Param('id') id: string,
  ): Promise<HostHotelDetailDto> {
    return this.host.getMyHotel(id, hostId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update my hotel',
    description: 'Updates hotel fields. A host can suspend their own listing, but only an admin can publish it.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The hotel, by uuid or slug.',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated hotel.',
    schema: { $ref: contractRef('HostHotelEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Not a host/admin, not the owner, or a host attempting to publish.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'Hotel not found or not owned by this host.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async updateHotel(
    @CurrentUser('id') hostId: string,
    @Param('id') id: string,
    @Body(zodPipe(updateHotelSchema)) data: UpdateHotelDto,
  ): Promise<HostHotelDetailDto> {
    return this.host.updateHotel(id, hostId, data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipEnvelope()
  @ApiOperation({
    summary: 'Delete my hotel',
    description:
      'Deletes the hotel and all its rooms, images, and blackout dates. Only if none of its ' +
      'rooms has any booking: booking history is kept, so a hotel that has hosted a stay is ' +
      'not removable (409 HOTEL_HAS_BOOKINGS).',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The hotel, by uuid or slug.',
  })
  @ApiResponse({
    status: 204,
    description: 'Deleted.',
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Not a host/admin, or not the owner.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'Hotel not found or not owned by this host.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 409,
    description:
      'The hotel has bookings on any of its rooms (`HOTEL_HAS_BOOKINGS`). Booking history ' +
      'is kept, so a listing with past stays is not removable either.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async deleteHotel(
    @CurrentUser('id') hostId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.host.deleteHotel(id, hostId);
  }

  // --- Rooms ---

  @Post(':id/rooms')
  @ApiOperation({
    summary: 'Add a room to my hotel',
    description:
      'Creates a room type with prices (per currency), images, and inventory. Every image ' +
      "`publicId` must start with the caller's own `booking/hotels/{hostId}/` folder or the " +
      'request is 403 `UPLOAD_FOREIGN` — the rule T21 applies to `/api/uploads/attach`, since ' +
      'a room image is the same row.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The hotel, by uuid or slug.',
  })
  @ApiResponse({
    status: 201,
    description: 'The created room with its prices and images.',
    schema: { $ref: contractRef('RoomEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description:
      'Not a host/admin, not the owner of the hotel, or an image `publicId` outside the ' +
      "caller's own folder (`UPLOAD_FOREIGN`).",
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'Hotel not found or not owned by this host.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async createRoom(
    @CurrentUser('id') hostId: string,
    @Param('id') hotelId: string,
    @Body(zodPipe(createRoomSchema)) data: CreateRoomDto,
  ): Promise<RoomDetailDto> {
    return this.host.createRoom(hotelId, hostId, data);
  }

  @Patch('rooms/:roomId')
  @ApiOperation({
    summary: 'Update a room',
    description: 'Updates room fields. Prices and images are managed separately (not in this ticket).',
  })
  @ApiParam({
    name: 'roomId',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The room to update, by uuid.',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated room.',
    schema: { $ref: contractRef('RoomEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Not a host/admin, or not the owner of the hotel.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'Room not found or not owned by this host.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async updateRoom(
    @CurrentUser('id') hostId: string,
    @Param('roomId') roomId: string,
    @Body(zodPipe(updateRoomSchema)) data: UpdateRoomDto,
  ): Promise<RoomDetailDto> {
    return this.host.updateRoom(roomId, hostId, data);
  }

  @Delete('rooms/:roomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipEnvelope()
  @ApiOperation({
    summary: 'Delete a room',
    description:
      'Deletes the room and its blackout dates. Only if no booking exists for this room, ' +
      'cancelled or completed ones included (409 ROOM_HAS_BOOKINGS).',
  })
  @ApiParam({
    name: 'roomId',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The room to delete, by uuid.',
  })
  @ApiResponse({
    status: 204,
    description: 'Deleted.',
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Not a host/admin, or not the owner of the hotel.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'Room not found or not owned by this host.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 409,
    description:
      'The room has bookings on it (`ROOM_HAS_BOOKINGS`). Booking history is kept, so a ' +
      'room with past stays is not removable either.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async deleteRoom(
    @CurrentUser('id') hostId: string,
    @Param('roomId') roomId: string,
  ): Promise<void> {
    await this.host.deleteRoom(roomId, hostId);
  }

  // --- Blackout dates ---

  @Post(':id/blackouts')
  @ApiOperation({
    summary: 'Add blackout dates',
    description: 'Creates a blackout date range. If roomId is null, applies to the whole hotel. If roomId is provided, applies only to that room.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The hotel, by uuid or slug.',
  })
  @ApiResponse({
    status: 201,
    description: 'The created blackout date.',
    schema: { $ref: contractRef('BlackoutEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (dates must be YYYY-MM-DD, no overlap with existing blackouts).',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Not a host/admin, or not the owner of the hotel.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'Hotel not found or not owned by this host.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async createBlackout(
    @CurrentUser('id') hostId: string,
    @Param('id') hotelId: string,
    @Body(zodPipe(createBlackoutSchema)) data: CreateBlackoutDto,
  ): Promise<BlackoutDateDto> {
    return this.host.createBlackout(hotelId, hostId, {
      ...data,
      startsOn: new Date(data.startsOn),
      endsOn: new Date(data.endsOn),
    });
  }

  @Delete('blackouts/:blackoutId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipEnvelope()
  @ApiOperation({
    summary: 'Delete a blackout date',
  })
  @ApiParam({
    name: 'blackoutId',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The blackout date to delete, by uuid.',
  })
  @ApiResponse({
    status: 204,
    description: 'Deleted.',
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'Not a host/admin, or not the owner of the hotel.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'Blackout not found or not owned by this host.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  async deleteBlackout(
    @CurrentUser('id') hostId: string,
    @Param('blackoutId') blackoutId: string,
  ): Promise<void> {
    await this.host.deleteBlackout(blackoutId, hostId);
  }
}
