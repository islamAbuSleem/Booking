import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';
import { imageSummarySchema } from '../../hotels/dto/hotel.dto.js';

/**
 * T21 — the uploads contract, as Zod schemas.
 *
 * The backend owns the API shape, so these schemas ARE the contract: `openapi.json` is
 * generated from them (`src/openapi/schemas.ts`). `attach` returns the T16 `HotelImage`
 * component, imported — not redefined — so the frontend generates one shared type for an
 * image wherever it appears.
 */

/**
 * `POST /api/uploads/sign` — the config the browser uses to upload directly to Cloudinary.
 * `apiKey` is returned on purpose: a signed upload exposes the key, and only the secret
 * (used to compute `signature`) stays server-side. `folder` is the caller's own
 * `booking/hotels/{hostId}/`, and `signature` is `base64(HMAC-SHA1(secret,
 * "folder=" + folder + "&timestamp=" + timestamp))`, which Cloudinary re-verifies. The
 * folder is inside the signature, so a caller cannot retarget the upload elsewhere.
 */
export const uploadSignSchema = z.object({
  cloudName: z.string().describe('The Cloudinary cloud the browser uploads to.'),
  apiKey: z.string().describe('Exposed to the browser; the secret is not.'),
  timestamp: z
    .int()
    .describe('Unix seconds the signature is bound to; Cloudinary rejects a stale one.'),
  folder: z.string().describe('The caller\'s own folder, booking/hotels/{hostId}/.'),
  signature: z
    .string()
    .describe(
      'base64 HMAC-SHA1 of "folder=" + folder + "&timestamp=" + timestamp under the API secret.',
    ),
});

export type UploadSignData = z.infer<typeof uploadSignSchema>;

export const uploadSignEnvelopeSchema = envelopeSchema(uploadSignSchema);

/**
 * `POST /api/uploads/attach` — the result the browser posts back after Cloudinary accepts
 * the upload. The schema strips anything else, so a client cannot widen the row. `publicId`
 * is optional because an asset may be attached without it; when present it is checked
 * against the caller's folder prefix before the row is written.
 */
export const attachUploadSchema = z.object({
  hotelId: z.uuid().describe('The hotel the image belongs to, by uuid.'),
  roomId: z
    .uuid()
    .optional()
    .describe('Set for room-level imagery, omitted for hotel-level.'),
  url: z.string().min(1).describe('The Cloudinary URL the asset uploaded to.'),
  publicId: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The Cloudinary publicId, needed for deletes. Must start with the caller\'s ' +
        'booking/hotels/{hostId}/ folder or the attach is 403 UPLOAD_FOREIGN.',
    ),
  altText: z.string().optional(),
  isCover: z.boolean().optional(),
  width: z.int().positive().optional().describe('Intrinsic width, for CLS.'),
  height: z.int().positive().optional().describe('Intrinsic height, for CLS.'),
  aspect: z.string().optional().describe('Aspect ratio, e.g. 3:2, 4:3, 16:9, 1:1.'),
});

export type AttachUpload = z.infer<typeof attachUploadSchema>;

/**
 * The `attach` success body: `{ success: true, data: HotelImage }`. `data` is the T16
 * `HotelImage` component, wrapped — not redefined — so the frontend generates one type.
 */
export const attachUploadEnvelopeSchema = envelopeSchema(imageSummarySchema);

export type AttachUploadEnvelope = z.infer<typeof attachUploadEnvelopeSchema>;

/**
 * `DELETE /api/uploads/:publicId` — the `publicId` on the wire. It is not a uuid; it is a
 * Cloudinary path like `booking/hotels/{hostId}/abcd123`. The path param is only checked
 * non-empty; the folder-prefix rule is the service's, not the schema's.
 */
export const uploadPublicIdParam = z.object({
  publicId: z.string().min(1),
});

export type UploadPublicIdParam = z.infer<typeof uploadPublicIdParam>;

/** Named so the OpenAPI components are stable, readable identifiers. */
export const DTO_SCHEMAS = {
  UploadSign: uploadSignSchema,
  UploadSignEnvelope: uploadSignEnvelopeSchema,
  AttachUpload: attachUploadSchema,
  AttachUploadEnvelope: attachUploadEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;
