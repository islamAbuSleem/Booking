import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../../common/errors/api-error.js';
import { RestCloudinaryClient } from './cloudinary.client.js';

/**
 * T21 — the one real network call in the uploads module, pinned against a stubbed `fetch`.
 *
 * The service tests fake the `CLOUDINARY` token, so nothing else would catch a wrong
 * endpoint, a wrong verb, or a `publicId` that gets mangled into the path. Cloudinary
 * rejects a delete that asks the wrong way, so the request shape is part of the contract.
 */
describe('RestCloudinaryClient.destroy', () => {
  const CLOUD = 'real-cloud';
  const PUBLIC_ID = 'booking/hotels/host-1/lobby';

  function makeClient(fetchImpl: typeof fetch): RestCloudinaryClient {
    const config = {
      get: (key: string) =>
        ({
          CLOUDINARY_CLOUD_NAME: CLOUD,
          CLOUDINARY_API_KEY: 'real-key',
          CLOUDINARY_API_SECRET: 'real-secret',
        })[key],
    } as unknown as ConfigService;
    vi.stubGlobal('fetch', fetchImpl);
    return new RestCloudinaryClient(config);
  }

  function okStub(): ReturnType<typeof vi.fn> {
    return vi.fn().mockResolvedValue({ ok: true, status: 200 });
  }

  /** The recorded request, narrowed to what the client actually sends. */
  function sentRequest(fetchMock: ReturnType<typeof vi.fn>): {
    url: string;
    init: RequestInit & { body: string };
  } {
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return { url, init: init as RequestInit & { body: string } };
  }

  it('POSTs to the v1_1 destroy endpoint with the publicId in the body', async () => {
    // The legacy `/image/destroy/{public_id}` form is GET/form-POST only, and it reads the
    // id as a literal path segment, so a folder-scoped id never resolves through it.
    const fetchMock = okStub();
    await makeClient(fetchMock as unknown as typeof fetch).destroy(PUBLIC_ID);

    expect(fetchMock).toHaveBeenCalledOnce();
    const { url, init } = sentRequest(fetchMock);
    expect(url).toBe(
      `https://api.cloudinary.com/v1_1/${CLOUD}/image/destroy`,
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ public_id: PUBLIC_ID });
  });

  it('keeps the publicId out of the URL so the folder separators are not escaped', async () => {
    const fetchMock = okStub();
    await makeClient(fetchMock as unknown as typeof fetch).destroy(PUBLIC_ID);

    const { url, init } = sentRequest(fetchMock);
    // No `%2F` anywhere: the id travels as a JSON value, not as a path segment.
    expect(url).not.toContain('%2F');
    expect(url).not.toContain('host-1');
    expect(init.body).toContain('booking/hotels/host-1/lobby');
  });

  it('authenticates with HTTP Basic so the secret never leaves the server', async () => {
    const fetchMock = okStub();
    await makeClient(fetchMock as unknown as typeof fetch).destroy(PUBLIC_ID);

    const { init } = sentRequest(fetchMock);
    const expected = Buffer.from('real-key:real-secret').toString('base64');
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${expected}`,
    );
    expect(JSON.stringify(init)).not.toContain('real-secret');
  });

  it('resolves quietly when Cloudinary accepted the destroy', async () => {
    await expect(
      makeClient(okStub() as unknown as typeof fetch).destroy(PUBLIC_ID),
    ).resolves.toBeUndefined();
  });

  it('raises a 502 INTERNAL_ERROR when Cloudinary refuses, so no 204 lies', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const client = makeClient(fetchMock as unknown as typeof fetch);

    await expect(client.destroy(PUBLIC_ID)).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
    });
    await expect(client.destroy(PUBLIC_ID)).rejects.toBeInstanceOf(ApiError);
  });

  it('keeps the placeholder-config path callable rather than throwing on a bad URL', async () => {
    // OAuth-style placeholders must not crash the delete path on an empty cloud name; the
    // refusal above is the 502 that surfaces instead.
    const config = { get: () => '' } as unknown as ConfigService;
    const fetchMock = okStub();
    vi.stubGlobal('fetch', fetchMock);

    await new RestCloudinaryClient(config).destroy(PUBLIC_ID);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.cloudinary.com/v1_1//image/destroy',
    );
  });
});
