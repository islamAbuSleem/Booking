import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import type { SitemapUrlsDataDto } from '../hotels/dto/hotel.dto.js';
import { HotelsService } from '../hotels/hotels.service.js';

/**
 * T31 — the sitemap feed. Its own controller (not a route on `HotelsController`)
 * because its path (`/api/sitemap/urls`) is not a hotel resource, and its own
 * `@Public()` because crawlers are anonymous by definition.
 */
@Controller('sitemap')
export class SitemapController {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(@Inject(HotelsService) private readonly hotels: HotelsService) {}

  @Get('urls')
  @Public()
  @ApiOperation({
    summary: 'Publishable hotel slugs for the sitemap',
    description:
      'Slugs and lastmod timestamps for every PUBLISHED hotel. The Nuxt sitemap module ' +
      'reads this at build time; a non-published row never appears because the filter ' +
      'is in SQL, not applied afterwards.',
  })
  @ApiResponse({
    status: 200,
    description: 'The slugs, with ISO 8601 lastmod each.',
    schema: { $ref: contractRef('SitemapUrlsEnvelope') },
  })
  urls(): Promise<SitemapUrlsDataDto> {
    return this.hotels.sitemapUrls();
  }
}
