import { Module } from '@nestjs/common';
import { CancellationsModule } from '../cancellations/cancellations.module.js';
import { HostController } from './host.controller.js';
import { HostService } from './host.service.js';
import { PrismaHostRepository } from './prisma-host.repository.js';
import { HOST_REPOSITORY } from './host.repository.js';

@Module({
  imports: [CancellationsModule],
  controllers: [HostController],
  providers: [
    HostService,
    { provide: HOST_REPOSITORY, useClass: PrismaHostRepository },
  ],
  exports: [HostService, HOST_REPOSITORY],
})
export class HostModule {}