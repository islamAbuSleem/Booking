import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  type HotelImageCreateInput,
  type HotelImageRecord,
  type UploadsRepository,
} from './uploads.repository.js';
import { PrismaService } from './prisma.service.js';

/**
 * T21 — Prisma implementation of `UploadsRepository`.
 *
 * The schema's `@@unique([hotelId, url])` means the same asset is never attached to a
 * hotel twice. A `create` that violates it throws Prisma `P2002`, which the exception
 * filter already translates to a 409 `CONFLICT` at the boundary (context/architecture.md,
 * "Prisma error" table) — so no special handling lives here, and the Prisma code never
 * has to leave this file on the happy path either.
 */

/** Only the columns the `attach` response and the delete path read. */
const IMAGE_SELECT = {
  id: true,
  hotelId: true,
  roomId: true,
  url: true,
  publicId: true,
  altText: true,
  aspect: true,
  width: true,
  height: true,
  isCover: true,
} satisfies Prisma.HotelImageSelect;

type ImageRow = Prisma.HotelImageGetPayload<{ select: typeof IMAGE_SELECT }>;

@Injectable()
export class PrismaUploadsRepository implements UploadsRepository {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`, so an
  // inferred token would be undefined in the OpenAPI preview (see PrismaService).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(input: HotelImageCreateInput): Promise<HotelImageRecord> {
    const row = await this.prisma.hotelImage.create({
      data: {
        hotelId: input.hotelId,
        roomId: input.roomId,
        url: input.url,
        publicId: input.publicId,
        altText: input.altText,
        aspect: input.aspect,
        width: input.width,
        height: input.height,
        isCover: input.isCover,
      },
      select: IMAGE_SELECT,
    });
    return toRecord(row);
  }

  async findByPublicId(publicId: string): Promise<HotelImageRecord | null> {
    const row = await this.prisma.hotelImage.findFirst({
      where: { publicId },
      select: IMAGE_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async deleteByPublicId(publicId: string): Promise<void> {
    // `deleteMany`, never `delete`: the caller 404'd a missing id via `findByPublicId`
    // first, so a zero here is a race between two deletes, not an error to surface.
    await this.prisma.hotelImage.deleteMany({ where: { publicId } });
  }
}

function toRecord(row: ImageRow): HotelImageRecord {
  return {
    id: row.id,
    hotelId: row.hotelId,
    roomId: row.roomId,
    url: row.url,
    publicId: row.publicId,
    altText: row.altText,
    aspect: row.aspect,
    width: row.width,
    height: row.height,
    isCover: row.isCover,
  };
}
