import {
  computeUploadSignature,
  hostFolderPrefix,
} from './cloudinary.signature.js';

/**
 * T21 — the two pure pieces of `sign`, pinned against a known vector so a wrong HMAC
 * algorithm, a wrong message format, or a wrong folder shape is caught, not assumed. No
 * Nest container, no network, no credentials.
 */
describe('computeUploadSignature', () => {
  it('matches the known Cloudinary vector for a fixed secret, folder and timestamp', () => {
    // base64( HMAC-SHA1("test-secret", "folder=booking/hotels/host-1/&timestamp=1700000000") ),
    // computed independently with node:crypto. A digest in a different encoding (raw
    // bytes), a different message ("ts=..." instead of "timestamp=..."), a SHA-256, or a
    // message that leaves `folder` out all fail this pin.
    expect(
      computeUploadSignature('test-secret', 'booking/hotels/host-1/', 1_700_000_000),
    ).toBe('bSb+oXOp2xPQxzszD+7UZvAfTkM=');
  });

  it('binds the folder into the signature, so a retargeted folder cannot verify', () => {
    const secret = 'secret';
    const timestamp = 100;
    const own = computeUploadSignature(secret, 'booking/hotels/host-1/', timestamp);
    // A different host's folder is a different signature: the folder is signed, not a hint.
    expect(computeUploadSignature(secret, 'booking/hotels/host-2/', timestamp)).not.toBe(
      own,
    );
  });

  it('is deterministic for the same inputs and stable to the exact timestamp', () => {
    const a = computeUploadSignature('secret', 'booking/hotels/host-1/', 100);
    const b = computeUploadSignature('secret', 'booking/hotels/host-1/', 100);
    expect(a).toBe(b);
    // A different timestamp is a different signature: the timestamp is in the message.
    expect(
      computeUploadSignature('secret', 'booking/hotels/host-1/', 101),
    ).not.toBe(a);
  });

  it('treats the empty secret as a valid HMAC key, not a missing one', () => {
    // The OAuth-style placeholder path: an empty/placeholder secret still produces a
    // signature, it just does not authenticate against a real Cloudinary.
    expect(computeUploadSignature('', 'booking/hotels/host-1/', 5)).toHaveLength(28); // base64 of a 20-byte digest
  });
});

describe('hostFolderPrefix', () => {
  it('joins the platform path and the host id with the host in the middle', () => {
    expect(hostFolderPrefix('booking/hotels/', 'host-1')).toBe(
      'booking/hotels/host-1/',
    );
  });

  it('is the exact prefix every publicId the host may touch must start with', () => {
    const prefix = hostFolderPrefix('booking/hotels/', 'host-1');
    expect(`${prefix}abcd123`.startsWith(prefix)).toBe(true);
    expect('booking/hotels/other/abcd123'.startsWith(prefix)).toBe(false);
    // The sibling folder that shares the platform prefix must not match.
    expect('booking/hotels/host-11/abcd'.startsWith(prefix)).toBe(false);
  });
});
