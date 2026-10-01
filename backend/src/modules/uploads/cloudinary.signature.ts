import { createHmac } from 'node:crypto';

/**
 * T21 — the pure pieces of a Cloudinary signed upload, split out of the DI token so a
 * unit test can pin them against a known vector with no Nest container, no network, and no
 * credentials (context/code-standards.md, "Dependency inversion").
 *
 * Cloudinary's signed-upload signature is `base64(HMAC-SHA1(apiSecret, message))` where
 * `message` is the stringified request params; for an upload that is `"timestamp=" +
 * timestamp`. The browser POSTs `{ api_key, timestamp, signature, folder }` and Cloudinary
 * re-computes the same HMAC to verify it. Only the secret stays server-side; the
 * `api_key` is handed to the browser on purpose.
 */

/**
 * `base64(HMAC-SHA1(apiSecret, "timestamp=" + timestamp))` — Cloudinary's upload
 * signature, computed with Node's `crypto` rather than the Cloudinary SDK.
 */
export function computeUploadSignature(
  apiSecret: string,
  timestamp: number,
): string {
  return createHmac('sha1', apiSecret)
    .update(`timestamp=${timestamp}`)
    .digest('base64');
}

/**
 * The folder prefix owned by one host, and the boundary of every `publicId` they may
 * attach or delete. `uploadPath` is the platform-wide folder (default
 * `booking/hotels/`) and the host id is the caller's own, so the prefix is
 * `booking/hotels/{hostId}/` — the folder-prefix rule T21 enforces (D58), before any
 * listing-ownership check that T22 owns.
 */
export function hostFolderPrefix(uploadPath: string, hostId: string): string {
  return `${uploadPath}${hostId}/`;
}
