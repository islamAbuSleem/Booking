import { Global, Module } from '@nestjs/common';
import { USERS_REPOSITORY } from '../modules/users/users.repository.js';
import { PrismaUsersRepository } from '../modules/users/prisma-users.repository.js';
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
    PrismaUsersRepository,
    { provide: USERS_REPOSITORY, useExisting: PrismaUsersRepository },
  ],
  exports: [
    PrismaService,
    PrismaHotelsRepository,
    HOTELS_REPOSITORY,
    PrismaUsersRepository,
    USERS_REPOSITORY,
  ],
})
export class PrismaModule {}
