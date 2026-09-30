import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import type { HealthDataDto } from '../hotels/dto/hotel.dto.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Liveness and database reachability',
    description:
      'Always 200. `status` is "ok" only when the database answered; `db` carries ' +
      'reachability on its own, so a monitor can alert on it without parsing a status string.',
  })
  @ApiOkResponse({
    description:
      'The service answered. The database may still be down — read `db`.',
    schema: { $ref: contractRef('HealthEnvelope') },
  })
  check(): Promise<HealthDataDto> {
    return this.health.check();
  }
}
