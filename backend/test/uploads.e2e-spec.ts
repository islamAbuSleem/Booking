import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { CLOUDINARY, type CloudinaryClient } from '../src/modules/uploads/cloudinary.client.js';
import {
  type HotelImageCreateInput,
  type HotelImageRecord,
  type UploadsRepository,
  UPLOADS_REPOSITORY,
} from '../src/prisma/uploads.repository.js';
import {
  USERS_REPOSITORY,
  type UserRecord,
  type UsersRepository,
} from '../src/modules/users/users.repository.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * T21 over real HTTP, with only the database and the Cloudinary call replaced.
 *
 * The guard, the pipes, the envelope and the status codes are all real; the two
 * repositories are in-memory and the `CLOUDINARY` token is a recorder, so no network
 * call to Cloudinary ever happens. Cases 1-7 have their proof at the unit level in
 * `uploads.service.spec.ts`; this file pins the wire: the 201/204/403/404 codes a client
 * branches on, the folder scoping of `sign`, the 401 every route owes an anonymous caller,
 * and the OpenAPI document's three paths.
 */

const HOTEL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const HOST_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOST_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PASSWORD = 'correct-password-1';
// The env schema default `CLOUDINARY_UPLOAD_PATH`, which the e2e seed never overrides.
const UPLOAD_PATH = 'booking/hotels/';

const folderOf = (hostId: string) => `${UPLOAD_PATH}${hostId}/`;
const ownPublicId = `booking/hotels/${HOST_A}/lobby`;
const foreignPublicId = `booking/hotels/${HOST_B}/lobby`;

/**
 * A `publicId` is a Cloudinary path full of slashes, so on the wire it is a single
 * `%2F`-encoded segment of `/api/uploads/:publicId`. Encoding is what a real HTTP client
 * does; Express decodes it back before the param reaches the handler.
 */
const deleteUrl = (publicId: string) => `/api/uploads/${encodeURIComponent(publicId)}`;

class InMemoryUploads implements UploadsRepository {
  rows: HotelImageRecord[] = [];
  private seq = 0;

  async create(input: HotelImageCreateInput): Promise<HotelImageRecord> {
    this.seq += 1;
    const record: HotelImageRecord = { id: `img-${this.seq}`, ...input };
    this.rows.push(record);
    return record;
  }

  async findByPublicId(publicId: string): Promise<HotelImageRecord | null> {
    return this.rows.find((row) => row.publicId === publicId) ?? null;
  }

  async deleteByPublicId(publicId: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.publicId !== publicId);
  }

  reset(): void {
    this.rows = [];
    this.seq = 0;
  }
}

class FakeCloudinaryClient implements CloudinaryClient {
  destroyed: string[] = [];

  async destroy(publicId: string): Promise<void> {
    this.destroyed.push(publicId);
  }

  reset(): void {
    this.destroyed = [];
  }
}

/** Only what the JWT guard and the login read. */
class StubUsers implements UsersRepository {
  constructor(private readonly byEmail: Map<string, UserRecord>) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.byEmail.get(email) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    for (const user of this.byEmail.values()) {
      if (user.id === id) return user;
    }
    return null;
  }

  async findByOAuth(): Promise<UserRecord | null> {
    return null;
  }

  async create(): Promise<UserRecord> {
    throw new Error('unused');
  }

  async update(): Promise<UserRecord> {
    throw new Error('unused');
  }
}

async function seededHost(
  passwords: PasswordService,
  id: string,
  email: string,
): Promise<UserRecord> {
  return {
    id,
    email,
    name: email,
    avatarUrl: null,
    passwordHash: await passwords.hash(PASSWORD),
    role: 'HOST',
    oauthProvider: null,
    oauthAccountId: null,
    createdAt: new Date(),
  };
}

describe('Uploads API (e2e)', () => {
  let app: INestApplication;
  let uploads: InMemoryUploads;
  let cloudinary: FakeCloudinaryClient;
  let hostACookie: string;
  let hostBCookie: string;

  beforeAll(async () => {
    uploads = new InMemoryUploads();
    cloudinary = new FakeCloudinaryClient();
    const passwords = new PasswordService();
    const hostA = await seededHost(passwords, HOST_A, 'host-a@example.com');
    const hostB = await seededHost(passwords, HOST_B, 'host-b@example.com');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: () => Promise.resolve([{ ok: 1 }]),
        $connect: () => Promise.resolve(),
      })
      .overrideProvider(USERS_REPOSITORY)
      .useValue(
        new StubUsers(
          new Map([
            [hostA.email, hostA],
            [hostB.email, hostB],
          ]),
        ),
      )
      .overrideProvider(UPLOADS_REPOSITORY)
      .useValue(uploads)
      .overrideProvider(CLOUDINARY)
      .useValue(cloudinary)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const loginA = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: hostA.email, password: PASSWORD })
      .expect(200);
    hostACookie = (
      loginA.headers['set-cookie'] as unknown as string[]
    )[0] as string;

    const loginB = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: hostB.email, password: PASSWORD })
      .expect(200);
    hostBCookie = (
      loginB.headers['set-cookie'] as unknown as string[]
    )[0] as string;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    uploads.reset();
    cloudinary.reset();
  });

  describe('POST /api/uploads/sign', () => {
    it('returns a folder-scoped config for the caller', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/uploads/sign')
        .set('Cookie', hostACookie)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          cloudName: expect.any(String),
          apiKey: expect.any(String),
          timestamp: expect.any(Number),
          folder: folderOf(HOST_A),
          signature: expect.any(String),
        },
      });
    });

    it('401s an unauthenticated caller', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/uploads/sign')
        .expect(401);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    });
  });

  describe('POST /api/uploads/attach', () => {
    it('201s and persists the row for a publicId in the caller\'s folder', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/uploads/attach')
        .set('Cookie', hostACookie)
        .send({
          hotelId: HOTEL_ID,
          url: `https://res.cloudinary.com/x/image/upload/${ownPublicId}.jpg`,
          publicId: ownPublicId,
          isCover: true,
          width: 1600,
          height: 900,
          aspect: '16:9',
        })
        .expect(201);

      // The T16 HotelImage summary — the image renders with its real box on the detail page.
      expect(response.body.data).toEqual({
        url: `https://res.cloudinary.com/x/image/upload/${ownPublicId}.jpg`,
        altText: null,
        aspect: '16:9',
        width: 1600,
        height: 900,
      });
      expect(uploads.rows).toHaveLength(1);
    });

    it('403s UPLOAD_FOREIGN for a publicId in another host\'s folder', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/uploads/attach')
        .set('Cookie', hostACookie)
        .send({
          hotelId: HOTEL_ID,
          url: `https://res.cloudinary.com/x/image/upload/${foreignPublicId}.jpg`,
          publicId: foreignPublicId,
        })
        .expect(403);

      expect(response.body.error).toMatchObject({ code: 'UPLOAD_FOREIGN' });
      expect(uploads.rows).toHaveLength(0); // nothing written
    });

    it('201s when publicId is omitted — there is nothing to check', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/uploads/attach')
        .set('Cookie', hostACookie)
        .send({
          hotelId: HOTEL_ID,
          url: 'https://res.cloudinary.com/x/image/upload/cover-only.jpg',
        })
        .expect(201);

      expect(response.body.data).toEqual({
        url: 'https://res.cloudinary.com/x/image/upload/cover-only.jpg',
        altText: null,
        aspect: '3:2',
        width: 800,
        height: 533,
      });
    });

    it('401s an unauthenticated caller', async () => {
      await request(app.getHttpServer())
        .post('/api/uploads/attach')
        .send({ hotelId: HOTEL_ID, url: 'https://res.cloudinary.com/x/image/upload/a.jpg' })
        .expect(401);
    });
  });

  describe('DELETE /api/uploads/:publicId', () => {
    it('204s, destroys the asset, and removes the row', async () => {
      await request(app.getHttpServer())
        .post('/api/uploads/attach')
        .set('Cookie', hostACookie)
        .send({
          hotelId: HOTEL_ID,
          url: `https://res.cloudinary.com/x/image/upload/${ownPublicId}.jpg`,
          publicId: ownPublicId,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .delete(deleteUrl(ownPublicId))
        .set('Cookie', hostACookie)
        .expect(204);

      expect(response.body).toEqual({});
      expect(cloudinary.destroyed).toEqual([ownPublicId]);
      expect(uploads.rows).toHaveLength(0);
    });

    it('403s UPLOAD_FOREIGN for another host\'s publicId, before the DB', async () => {
      // Seed B's asset so it genuinely exists; A still cannot touch it.
      await request(app.getHttpServer())
        .post('/api/uploads/attach')
        .set('Cookie', hostBCookie)
        .send({
          hotelId: HOTEL_ID,
          url: `https://res.cloudinary.com/x/image/upload/${foreignPublicId}.jpg`,
          publicId: foreignPublicId,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .delete(deleteUrl(foreignPublicId))
        .set('Cookie', hostACookie)
        .expect(403);

      expect(response.body.error).toMatchObject({ code: 'UPLOAD_FOREIGN' });
      expect(cloudinary.destroyed).toEqual([]); // no destroy attempted
      expect(uploads.rows).toHaveLength(1); // B's row is intact
    });

    it('404s a non-foreign publicId that maps to no row', async () => {
      const neverAttached = `booking/hotels/${HOST_A}/ghost`;
      const response = await request(app.getHttpServer())
        .delete(deleteUrl(neverAttached))
        .set('Cookie', hostACookie)
        .expect(404);

      expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
      expect(cloudinary.destroyed).toEqual([]);
    });

    it('401s an unauthenticated caller', async () => {
      await request(app.getHttpServer())
        .delete(deleteUrl(ownPublicId))
        .expect(401);
    });
  });

  describe('the OpenAPI contract', () => {
    it('documents the three upload paths and the sign component', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);

      const paths = Object.keys(response.body.paths);
      expect(paths).toEqual(
        expect.arrayContaining([
          '/api/uploads/sign',
          '/api/uploads/attach',
          '/api/uploads/{publicId}',
        ]),
      );
      expect(response.body.components.schemas.UploadSign).toBeDefined();
      expect(response.body.components.schemas.AttachUpload).toBeDefined();
      // The attach response wraps the shared T16 HotelImage component, not a copy.
      expect(
        response.body.components.schemas.AttachUploadEnvelope.properties.data,
      ).toEqual({ $ref: '#/components/schemas/HotelImage' });
    });

    it('keeps the upload routes authenticated in the document', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);

      const paths = response.body.paths;
      expect(Object.keys(paths['/api/uploads/sign'].post.responses)).toEqual(
        expect.arrayContaining(['200', '401']),
      );
      expect(Object.keys(paths['/api/uploads/attach'].post.responses)).toEqual(
        expect.arrayContaining(['201', '400', '401', '403', '409']),
      );
      expect(Object.keys(paths['/api/uploads/{publicId}'].delete.responses)).toEqual(
        expect.arrayContaining(['204', '400', '401', '403', '404']),
      );
    });
  });
});
