import { createHmac } from 'node:crypto';

/**
 * T21 — the pure pieces of a Cloudinary signed upload, split out of the DI token so a
 * unit test can pin them against a known vector with no Nest container, no network, and no
 * credentials (context/code-standards.md, "Dependency inversion").
 *
 * Cloudinary's signed-upload signature is `base64(HMAC-SHA1(apiSecret, message))` where
 * `message` is every signed request param, sorted alphabetically and joined with `&` —
 * for this upload `"folder=" + folder + "&timestamp=" + timestamp`. The browser POSTs
 * `{ api_key, timestamp, signature, folder }` and Cloudinary re-computes the same HMAC
 * from exactly those params to verify it. `folder` is therefore **signed**, not a free-text
 * hint: a caller cannot move an asset out of the host folder the config handed them, and a
 * mismatch between what we sign and what the browser sends is an `Invalid Signature`.
 * Only the secret stays server-side; the `api_key` is handed to the browser on purpose.
 */

/**
 * `base64(HMAC-SHA1(apiSecret, "folder=" + folder + "&timestamp=" + timestamp))` —
 * Cloudinary's upload signature, computed with Node's `crypto` rather than the Cloudinary
 * SDK. Every param the browser sends and Cloudinary verifies is in the message.
 */
export function computeUploadSignature(
  apiSecret: string,
  folder: string,
  timestamp: number,
): string {
  return createHmac('sha1', apiSecret)
    .update(`folder=${folder}&timestamp=${timestamp}`)
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
