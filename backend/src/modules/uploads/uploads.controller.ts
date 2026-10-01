import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SkipEnvelope } from '../../common/envelope.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import {
  attachUploadSchema,
  uploadPublicIdParam,
  type AttachUpload,
  type UploadPublicIdParam,
} from './dto/uploads.dto.js';
import { UploadsService } from './uploads.service.js';

/**
 * T21 — the uploads routes. Thin on purpose: parse, delegate.
 *
 * All three default to authenticated (no `@Public()`): the caller is the JWT subject via
 * `@CurrentUser('id')`, and that subject is the `hostId` whose `booking/hotels/{hostId}/`
 * folder every `publicId` must live in. No route reads a caller id from a body or a query
 * string, which is why none can be talked into another host's folder. The host-role gate
 * on uploads arrives with T22 (listing management); T21 owns only the folder-prefix rule.
 */
@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @Post('sign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign a Cloudinary upload',
    description:
      'Returns the config the browser needs to POST straight to Cloudinary: the cloud name, ' +
      'the (exposed-on-purpose) API key, a unix-seconds timestamp, the caller\'s own ' +
      '`booking/hotels/{hostId}/` folder, and a `signature` of ' +
      '`base64(HMAC-SHA1(secret, "timestamp=" + timestamp))` that Cloudinary re-verifies. ' +
      'Only the secret stays server-side. Answers 200, not 201: nothing is created here.',
  })
  @ApiResponse({
    status: 200,
    description: 'The signed, folder-scoped upload config.',
    schema: { $ref: contractRef('UploadSignEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  sign(@CurrentUser('id') callerId: string) {
    return this.uploads.sign(callerId);
  }

  @Post('attach')
  @ApiOperation({
    summary: 'Attach an uploaded asset to a hotel',
    description:
      'Persists the `hotel_images` row the browser posts back after a Cloudinary upload. When ' +
      '`publicId` is present it must start with the caller\'s `booking/hotels/{hostId}/` ' +
      'folder prefix or the attach is 403 `UPLOAD_FOREIGN`; omitted, there is nothing to ' +
      'check. The hotel is not looked up here — a host may only touch their own listings is ' +
      'T22\'s query-filter rule; this one is a DB-free string check. Returns the T16 ' +
      '`HotelImage` summary.',
  })
  @ApiBody({ schema: { $ref: contractRef('AttachUpload') } })
  @ApiResponse({
    status: 201,
    description: 'The persisted image, as the T16 HotelImage summary.',
    schema: { $ref: contractRef('AttachUploadEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description:
      'The body failed validation: `hotelId`/`roomId` must be uuids, `url` non-empty.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'The `publicId` is not in the caller\'s folder (UPLOAD_FOREIGN).',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 409,
    description:
      'The `(hotelId, url)` pair is already attached — a composite unique key.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  attach(
    @CurrentUser('id') callerId: string,
    @Body(zodPipe(attachUploadSchema)) body: AttachUpload,
  ) {
    return this.uploads.attach(callerId, body);
  }

  @Delete(':publicId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipEnvelope()
  @ApiOperation({
    summary: 'Delete an uploaded asset',
    description:
      'Destroys the asset from Cloudinary by `publicId` and removes its `hotel_images` row. ' +
      'The `publicId` must live inside the caller\'s folder, checked before the DB, so a ' +
      'foreign id is 403 and never 404s into an existence leak. A non-foreign id with no ' +
      'row is 404, not 204: a 204 would claim the delete happened when there was nothing ' +
      'to delete.',
  })
  @ApiParam({
    name: 'publicId',
    required: true,
    type: String,
    description:
      'The Cloudinary publicId, a path like booking/hotels/{hostId}/abcd123.',
  })
  @ApiNoContentResponse({
    description: 'Gone: the asset is destroyed and the row removed.',
  })
  @ApiResponse({
    status: 400,
    description: 'The `publicId` path parameter is empty.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'The `publicId` is not in the caller\'s folder (UPLOAD_FOREIGN).',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No image row maps to that `publicId`.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  delete(
    @CurrentUser('id') callerId: string,
    @Param(zodPipe(uploadPublicIdParam)) params: UploadPublicIdParam,
  ): Promise<void> {
    return this.uploads.delete(callerId, params.publicId);
  }
}
