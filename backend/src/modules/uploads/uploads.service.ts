import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, notFound } from '../../common/errors/api-error.js';
import {
  type HotelImageRecord,
  type UploadsRepository,
  UPLOADS_REPOSITORY,
} from '../../prisma/uploads.repository.js';
import { HotelImageDto } from '../hotels/dto/hotel.dto.js';
import { CLOUDINARY, type CloudinaryClient } from './cloudinary.client.js';
import {
  computeUploadSignature,
  hostFolderPrefix,
} from './cloudinary.signature.js';
import { type AttachUpload, type UploadSignData } from './dto/uploads.dto.js';

/**
 * T21 — Cloudinary uploads, the API half of the browser-direct flow.
 *
 * `sign` is a pure function over the config plus the caller's own folder: it mints the
 * `timestamp`/`signature` the browser needs to POST straight to Cloudinary. `attach`
 * persists the `hotel_images` row the browser posts back, after the folder-prefix check.
 * `delete` destroys the asset through the `CLOUDINARY` token and removes the row.
 *
 * The one rule this ticket owns (D58) is the **folder-prefix** check: a `publicId` must
 * start with the caller's `booking/hotels/{hostId}/` prefix or it is 403 `UPLOAD_FOREIGN`.
 * A host may only touch their own listings — the query-filter rule that enforces that —
 * is T22's; `attach` deliberately does not look the hotel up (decision D4), so this stays
 * a DB-free string check. Depends on the `UPLOADS_REPOSITORY` and `CLOUDINARY` tokens,
 * never on `PrismaService`, so every rule here is testable with fakes and no database.
 */

/** The `hotel_images` schema defaults; a missing dimension is filled with these, not `0`. */
const DEFAULT_ASPECT = '3:2';
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 533;

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @Inject(UPLOADS_REPOSITORY) private readonly uploads: UploadsRepository,
    @Inject(CLOUDINARY) private readonly cloudinary: CloudinaryClient,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /**
   * `POST /api/uploads/sign`. Pure: the timestamp is the only thing that moves, and the
   * signature is `base64(HMAC-SHA1(secret, "timestamp=" + timestamp))`. When the Cloudinary
   * credentials are placeholders the config still returns — a real upload is the one thing
   * that fails at runtime, not this.
   */
  sign(callerId: string): UploadSignData {
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      cloudName: this.config.get<string>('CLOUDINARY_CLOUD_NAME') ?? '',
      apiKey: this.config.get<string>('CLOUDINARY_API_KEY') ?? '',
      timestamp,
      folder: hostFolderPrefix(this.uploadPath(), callerId),
      signature: computeUploadSignature(
        this.config.get<string>('CLOUDINARY_API_SECRET') ?? '',
        timestamp,
      ),
    };
  }

  /**
   * `POST /api/uploads/attach`. The `publicId` prefix is checked before the row is written;
   * when it is omitted the check is skipped, because an attach without a publicId cannot
   * be foreign. The row is then persisted under the caller's `hotelId`/`roomId` and
   * returned as the T16 `HotelImage` summary.
   */
  async attach(callerId: string, request: AttachUpload): Promise<HotelImageDto> {
    if (request.publicId !== undefined) {
      this.assertOwnPrefix(callerId, request.publicId);
    }

    const record = await this.uploads.create({
      hotelId: request.hotelId,
      roomId: request.roomId ?? null,
      url: request.url,
      publicId: request.publicId ?? null,
      altText: request.altText ?? null,
      aspect: request.aspect ?? DEFAULT_ASPECT,
      width: request.width ?? DEFAULT_WIDTH,
      height: request.height ?? DEFAULT_HEIGHT,
      isCover: request.isCover ?? false,
    });

    this.logger.log(
      `[uploads] attached ${record.url} to hotel ${record.hotelId} (publicId ${record.publicId ?? 'n/a'})`,
    );
    return this.toHotelImage(record);
  }

  /**
   * `DELETE /api/uploads/:publicId`. The foreign check runs before the DB, so a foreign id
   * never 404s into an existence leak. A non-foreign id with no row is a 404, not a 204:
   * a 204 would claim the delete happened when there was nothing to delete. The asset is
   * destroyed before the row is removed, so the two never disagree.
   */
  async delete(callerId: string, publicId: string): Promise<void> {
    this.assertOwnPrefix(callerId, publicId);

    const row = await this.uploads.findByPublicId(publicId);
    if (!row) throw notFound('NOT_FOUND', 'No such image');

    await this.cloudinary.destroy(publicId);
    await this.uploads.deleteByPublicId(publicId);
    this.logger.log(`[uploads] deleted ${publicId}`);
  }

  private uploadPath(): string {
    return this.config.get<string>('CLOUDINARY_UPLOAD_PATH') ?? 'booking/hotels/';
  }

  /**
   * The D58 rule in one line: the `publicId` must live inside the caller's folder prefix.
   * A plain `startsWith` on the string, no query, no credentials, no SDK.
   */
  private assertOwnPrefix(callerId: string, publicId: string): void {
    const prefix = hostFolderPrefix(this.uploadPath(), callerId);
    if (!publicId.startsWith(prefix)) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'UPLOAD_FOREIGN',
        'This asset is not in your upload folder',
      );
    }
  }

  private toHotelImage(record: HotelImageRecord): HotelImageDto {
    return {
      url: record.url,
      altText: record.altText,
      aspect: record.aspect,
      width: record.width,
      height: record.height,
    };
  }
}
