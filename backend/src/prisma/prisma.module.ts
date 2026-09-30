import { Global, Module } from '@nestjs/common';
import { HOTELS_REPOSITORY } from './hotels.repository.js';
import { PrismaHotelsRepository } from './prisma-hotels.repository.js';
import { PrismaService } from './prisma.service.js';

/**
 * The single Prisma client for the process, plus the repository bindings that hide it.
 * A module that needs data asks for a repository interface, never for `PrismaService`.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    PrismaHotelsRepository,
    { provide: HOTELS_REPOSITORY, useExisting: PrismaHotelsRepository },
  ],
  exports: [PrismaService, PrismaHotelsRepository, HOTELS_REPOSITORY],
})
export class PrismaModule {}
