import { type HostRepository, type HostHotelListPage, type HostHotelDetail, type RoomDetail, type HostBookingListPage, type CreateBlackoutData } from './host.repository.js';

/**
 * T22 — a trivial stub for the e2e tests that import AppModule.
 *
 * The real tests for the host endpoints will be in their own spec file. This
 * stub just returns empty pages so the other e2e tests can boot the module
 * without missing providers.
 */
export class StubHostRepository implements HostRepository {
  async findByHost(_hostId: string): Promise<HostHotelListPage> {
    return { items: [], total: 0 };
  }

  async findByIdAndHost(_id: string, _hostId: string): Promise<HostHotelDetail | null> {
    return null;
  }

  async create(_data: unknown): Promise<HostHotelDetail> {
    throw new Error('not implemented in stub');
  }

  async update(_id: string, _hostId: string, _data: unknown): Promise<HostHotelDetail> {
    throw new Error('not implemented in stub');
  }

  async delete(_id: string, _hostId: string): Promise<void> {
    throw new Error('not implemented in stub');
  }

  async createRoom(_data: unknown): Promise<RoomDetail> {
    throw new Error('not implemented in stub');
  }

  async updateRoom(_roomId: string, _hostId: string, _data: unknown): Promise<RoomDetail> {
    throw new Error('not implemented in stub');
  }

  async deleteRoom(_roomId: string, _hostId: string): Promise<void> {
    throw new Error('not implemented in stub');
  }

  async createBlackout(_data: CreateBlackoutData): Promise<{ id: string; roomId: string | null; hotelId: string; startsOn: Date; endsOn: Date; reason: string | null }> {
    throw new Error('not implemented in stub');
  }

  async deleteBlackout(_id: string, _hostId: string): Promise<void> {
    throw new Error('not implemented in stub');
  }

  async findBookingsByHost(_hostId: string): Promise<HostBookingListPage> {
    return { items: [], total: 0 };
  }

  async findRoomHost(_roomId: string): Promise<string | null> {
    return null;
  }

  async findBlackoutHost(_id: string): Promise<string | null> {
    return null;
  }
}