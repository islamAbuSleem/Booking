import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../../common/errors/api-error.js';

/**
 * T21 — the one server-side Cloudinary call: destroying an asset.
 *
 * `sign` is pure (see `cloudinary.signature.ts`), so this token is the only dependency a
 * service needs for the delete path. The real implementation is a plain `fetch` to the
 * Cloudinary admin REST endpoint — no `cloudinary` SDK anywhere in the tree — and it is
 * faked in tests, so no network call ever happens under the runner.
 *
 * Auth is HTTP Basic, `base64(apiKey:apiSecret)`: the secret stays server-side and never
 * reaches the browser, which only ever sees the key and the upload signature.
 */

export const CLOUDINARY = Symbol('CLOUDINARY');

export interface CloudinaryClient {
  /**
   * Deletes one asset by `publicId`. Throws when Cloudinary refuses, so the delete path
   * never claims success for an asset that still exists.
   */
  destroy(publicId: string): Promise<void>;
}

@Injectable()
export class RestCloudinaryClient implements CloudinaryClient {
  private readonly logger = new Logger(RestCloudinaryClient.name);

  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so an inferred token would be undefined at runtime.
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async destroy(publicId: string): Promise<void> {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME') ?? '';
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY') ?? '';
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET') ?? '';

    const url =
      `https://api.cloudinary.com/${encodeURIComponent(cloudName)}` +
      `/image/destroy/${encodeURIComponent(publicId)}`;
    const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

    const response = await fetch(url, {
      method: 'DELETE',
      headers: { authorization: `Basic ${basic}` },
    });
    if (!response.ok) {
      // Log the publicId only; the credential and the full URL stay out of the line.
      this.logger.error(
        `[uploads] cloudinary destroy ${publicId} -> ${response.status}`,
      );
      throw new ApiError(
        HttpStatus.BAD_GATEWAY,
        'INTERNAL_ERROR',
        'The image could not be removed from Cloudinary',
      );
    }
  }
}
