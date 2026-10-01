import type { ConfigService } from '@nestjs/config';
import {
  type HotelImageCreateInput,
  type HotelImageRecord,
  type UploadsRepository,
} from '../../prisma/uploads.repository.js';
import { type CloudinaryClient } from './cloudinary.client.js';
import {
  computeUploadSignature,
  hostFolderPrefix,
} from './cloudinary.signature.js';
import { UploadsService } from './uploads.service.js';

/**
 * T21 — the attach/delete rules against in-memory fakes. No Nest container, no database,
 * no Cloudinary credentials: the service depends on the `UPLOADS_REPOSITORY` and
 * `CLOUDINARY` tokens (context/code-standards.md, "Dependency inversion"), so the folder-
 * prefix rule, the 404, and the round trip are all provable here.
 */

const HOST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_HOST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOTEL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ROOM_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** The four Cloudinary placeholders from the env schema — the "missing creds" path. */
const PLACEHOLDER_CONFIG: Record<string, string> = {
  CLOUDINARY_CLOUD_NAME: 'booking-upload-placeholder',
  CLOUDINARY_API_KEY: '00000000000000000000000',
  CLOUDINARY_API_SECRET: 'cloudinary-upload-placeholder-secret',
  CLOUDINARY_UPLOAD_PATH: 'booking/hotels/',
};

/** A config with real-looking values, to prove the secret drives the signature. */
const REAL_CONFIG: Record<string, string> = {
  ...PLACEHOLDER_CONFIG,
  CLOUDINARY_CLOUD_NAME: 'real-cloud',
  CLOUDINARY_API_KEY: 'real-key',
  CLOUDINARY_API_SECRET: 'real-secret',
};

function configOf(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

class FakeUploads implements UploadsRepository {
  rows: HotelImageRecord[] = [];
  private seq = 0;

  async create(input: HotelImageCreateInput): Promise<HotelImageRecord> {
    this.seq += 1;
    const record: HotelImageRecord = {
      id: `row-${this.seq}`,
      ...input,
    };
    this.rows.push(record);
    return record;
  }

  async findByPublicId(publicId: string): Promise<HotelImageRecord | null> {
    return (
      this.rows.find((row) => row.publicId === publicId) ?? null
    );
  }

  async deleteByPublicId(publicId: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.publicId !== publicId);
  }
}

class FakeCloudinary implements CloudinaryClient {
  destroyed: string[] = [];

  async destroy(publicId: string): Promise<void> {
    this.destroyed.push(publicId);
  }
}

function makeService(
  values: Record<string, string> = PLACEHOLDER_CONFIG,
) {
  const uploadsRepo = new FakeUploads();
  const cloudinary = new FakeCloudinary();
  const service = new UploadsService(
    uploadsRepo,
    cloudinary,
    configOf(values),
  );
  return { service, uploadsRepo, cloudinary };
}

const ownPublicId = hostFolderPrefix('booking/hotels/', HOST_ID) + 'lobby';

describe('UploadsService.sign', () => {
  it('returns the config with the caller\'s folder and a signature of the configured secret', () => {
    const { service } = makeService(REAL_CONFIG);
    const result = service.sign(HOST_ID);

    expect(result.cloudName).toBe('real-cloud');
    expect(result.apiKey).toBe('real-key');
    expect(result.folder).toBe(hostFolderPrefix('booking/hotels/', HOST_ID));
    expect(result.timestamp).toBeTypeOf('number');
    // The signature is HMAC-SHA1 of the real secret — a placeholder secret would differ.
    expect(result.signature).toBe(
      computeUploadSignature('real-secret', result.folder, result.timestamp),
    );
  });

  it('still returns a full config under placeholder credentials, without crashing', () => {
    // The OAuth-style fallback: missing Cloudinary creds do not fail boot or sign; only a
    // real upload against the placeholder cloud fails at runtime.
    const { service } = makeService();
    const result = service.sign(HOST_ID);

    expect(result).toMatchObject({
      cloudName: PLACEHOLDER_CONFIG.CLOUDINARY_CLOUD_NAME,
      apiKey: PLACEHOLDER_CONFIG.CLOUDINARY_API_KEY,
      folder: hostFolderPrefix('booking/hotels/', HOST_ID),
    });
    // The signature is computed from whatever secret is configured, not skipped.
    expect(result.signature).toBe(
      computeUploadSignature(
        PLACEHOLDER_CONFIG.CLOUDINARY_API_SECRET,
        result.folder,
        result.timestamp,
      ),
    );
    expect(result.signature).toBeTypeOf('string');
  });

  it('scopes the folder to the caller, so two hosts get different prefixes', () => {
    const { service } = makeService();
    expect(service.sign(HOST_ID).folder).toBe(
      hostFolderPrefix('booking/hotels/', HOST_ID),
    );
    expect(service.sign(OTHER_HOST_ID).folder).toBe(
      hostFolderPrefix('booking/hotels/', OTHER_HOST_ID),
    );
  });
});

describe('UploadsService.attach', () => {
  it('persists the row with the given url, publicId, dimensions, and isCover', async () => {
    const { service, uploadsRepo } = makeService();
    const url = 'https://res.cloudinary.com/x/image/upload/booking/hotels/' + HOST_ID + '/cover.jpg';

    const result = await service.attach(HOST_ID, {
      hotelId: HOTEL_ID,
      roomId: ROOM_ID,
      url,
      publicId: ownPublicId,
      altText: 'The lobby',
      isCover: true,
      width: 1200,
      height: 900,
      aspect: '4:3',
    });

    // The response is the T16 image summary — five fields, no isCover.
    expect(result).toEqual({
      url,
      altText: 'The lobby',
      aspect: '4:3',
      width: 1200,
      height: 900,
    });
    // The persisted row is what T16 actually stores, and it carries isCover.
    expect(uploadsRepo.rows[0]).toMatchObject({
      hotelId: HOTEL_ID,
      roomId: ROOM_ID,
      url,
      publicId: ownPublicId,
      altText: 'The lobby',
      aspect: '4:3',
      width: 1200,
      height: 900,
      isCover: true,
    });
  });

  it('accepts a publicId that lives inside the caller\'s folder', async () => {
    const { service, uploadsRepo } = makeService();

    const result = await service.attach(HOST_ID, {
      hotelId: HOTEL_ID,
      url: 'https://res.cloudinary.com/x/image/upload/booking/hotels/' + HOST_ID + '/cover.jpg',
      publicId: ownPublicId,
    });

    expect(result.publicId).toBeUndefined(); // not part of the T16 summary
    expect(uploadsRepo.rows[0]?.publicId).toBe(ownPublicId);
  });

  it('403s UPLOAD_FOREIGN for a publicId from another host\'s folder, and writes nothing', async () => {
    const foreign = hostFolderPrefix('booking/hotels/', OTHER_HOST_ID) + 'cover';
    const { service, uploadsRepo } = makeService();

    await expect(
      service.attach(HOST_ID, {
        hotelId: HOTEL_ID,
        url: 'https://res.cloudinary.com/x/image/upload/booking/hotels/' + OTHER_HOST_ID + '/cover.jpg',
        publicId: foreign,
      }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'UPLOAD_FOREIGN' },
    });
    expect(uploadsRepo.rows).toEqual([]);
  });

  it('omits the prefix check when publicId is not supplied, and fills the dimension defaults', async () => {
    const { service, uploadsRepo } = makeService();

    const result = await service.attach(HOST_ID, {
      hotelId: HOTEL_ID,
      url: 'https://res.cloudinary.com/x/image/upload/cover-only.jpg',
    });

    // No publicId: nothing foreign to check; defaults fill the missing dimensions.
    expect(result).toEqual({
      url: 'https://res.cloudinary.com/x/image/upload/cover-only.jpg',
      altText: null,
      aspect: '3:2',
      width: 800,
      height: 533,
    });
    expect(uploadsRepo.rows[0]?.publicId).toBeNull();
  });
});

describe('UploadsService.delete', () => {
  it('destroys the asset, removes the row, and returns nothing', async () => {
    const { service, cloudinary, uploadsRepo } = makeService();
    await service.attach(HOST_ID, {
      hotelId: HOTEL_ID,
      url: 'https://res.cloudinary.com/x/image/upload/booking/hotels/' + HOST_ID + '/lobby.jpg',
      publicId: ownPublicId,
    });
    expect(uploadsRepo.rows).toHaveLength(1);

    await expect(service.delete(HOST_ID, ownPublicId)).resolves.toBeUndefined();
    expect(cloudinary.destroyed).toEqual([ownPublicId]);
    expect(uploadsRepo.rows).toHaveLength(0);
  });

  it('403s UPLOAD_FOREIGN before any Cloudinary or DB call, so a foreign id never 404s', async () => {
    const foreign = hostFolderPrefix('booking/hotels/', OTHER_HOST_ID) + 'lobby';
    const { service, cloudinary, uploadsRepo } = makeService();
    await service.attach(OTHER_HOST_ID, {
      hotelId: HOTEL_ID,
      url: 'https://res.cloudinary.com/x/image/upload/booking/hotels/' + OTHER_HOST_ID + '/lobby.jpg',
      publicId: foreign,
    });

    // HOST_ID tries to delete OTHER_HOST_ID\'s asset: the prefix check fires first.
    await expect(service.delete(HOST_ID, foreign)).rejects.toMatchObject({
      status: 403,
      response: { code: 'UPLOAD_FOREIGN' },
    });
    expect(cloudinary.destroyed).toEqual([]);
    expect(uploadsRepo.rows).toHaveLength(1); // the foreign row is untouched
  });

  it('404s a non-foreign publicId that maps to no row, without destroying anything', async () => {
    const neverAttached = hostFolderPrefix('booking/hotels/', HOST_ID) + 'ghost';
    const { service, cloudinary } = makeService();

    await expect(service.delete(HOST_ID, neverAttached)).rejects.toMatchObject({
      status: 404,
      response: { code: 'NOT_FOUND' },
    });
    expect(cloudinary.destroyed).toEqual([]);
  });

  it('destroys before removing, so the two never disagree on a race', async () => {
    // A delete of a publicId that a first call already destroyed and removed: the second
    // call finds no row and 404s, and does NOT destroy the (already gone) asset again.
    const { service, cloudinary, uploadsRepo } = makeService();
    await service.attach(HOST_ID, {
      hotelId: HOTEL_ID,
      url: 'https://res.cloudinary.com/x/image/upload/booking/hotels/' + HOST_ID + '/lobby.jpg',
      publicId: ownPublicId,
    });
    await service.delete(HOST_ID, ownPublicId);
    expect(cloudinary.destroyed).toEqual([ownPublicId]);

    await expect(service.delete(HOST_ID, ownPublicId)).rejects.toMatchObject({
      status: 404,
    });
    expect(cloudinary.destroyed).toEqual([ownPublicId]); // not destroyed a second time
    expect(uploadsRepo.rows).toHaveLength(0);
  });
});

/**
 * The ticket's own verify line: "an image survives a round trip and renders on the detail
 * page." The uploaded asset is what the browser posts back; attaching it stores the row;
 * T16's detail read projects that row into the five-field summary the `<img>` renders from.
 */
describe('the upload → attach → detail round trip', () => {
  it('an uploaded asset, attached, persists the exact fields T16 renders', async () => {
    const { service, uploadsRepo } = makeService();

    // What Cloudinary returns and the browser posts back to `attach`:
    const uploaded = {
      publicId: ownPublicId,
      url:
        'https://res.cloudinary.com/real-cloud/image/upload/booking/hotels/' +
        HOST_ID +
        '/lobby.jpg',
      width: 1600,
      height: 900,
    };
    const summary = await service.attach(HOST_ID, {
      hotelId: HOTEL_ID,
      url: uploaded.url,
      publicId: uploaded.publicId,
      isCover: true,
      width: uploaded.width,
      height: uploaded.height,
      aspect: '16:9',
    });

    // The persisted row carries the dimensions faithfully — not zero, not dropped.
    const row = uploadsRepo.rows[0];
    expect(row).toMatchObject({
      url: uploaded.url,
      publicId: uploaded.publicId,
      width: uploaded.width,
      height: uploaded.height,
      aspect: '16:9',
      isCover: true,
    });

    // The T16 detail read projects a row to its five summary fields; the attach response
    // is exactly that projection, so the image renders with the right box on the page.
    expect(summary).toEqual({
      url: row.url,
      altText: row.altText,
      aspect: row.aspect,
      width: row.width,
      height: row.height,
    });
  });
});
