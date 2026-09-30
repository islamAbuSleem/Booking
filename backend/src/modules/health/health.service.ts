import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { HealthDataDto } from '../hotels/dto/hotel.dto.js';

/**
 * T13 — `GET /api/health`.
 *
 * Reports rather than throws. A liveness probe that 500s because the database is briefly
 * unreachable turns a degradation into an outage, and the caller can already tell the two
 * apart from `status` and `db`.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthDataDto> {
    const db = await this.probeDatabase();
    if (db === 'down') {
      this.logger.warn('[health] database is not reachable');
    }
    return { status: db === 'up' ? 'ok' : 'degraded', db };
  }

  private async probeDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      // The cause is not returned: a health endpoint must not become an information leak
      // about the connection string or the host. The request log already has context.
      return 'down';
    }
  }
}
