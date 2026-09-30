import { Global, Module } from '@nestjs/common';
import { USERS_REPOSITORY } from '../modules/users/users.repository.js';
import { PrismaUsersRepository } from '../modules/users/prisma-users.repository.js';
import { AVAILABILITY_REPOSITORY } from './availability.repository.js';
import { FAVORITES_REPOSITORY } from './favorites.repository.js';
import { HOTELS_REPOSITORY } from './hotels.repository.js';
import { PrismaAvailabilityRepository } from './prisma-availability.repository.js';
import { PrismaFavoritesRepository } from './prisma-favorites.repository.js';
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
    PrismaAvailabilityRepository,
    {
      provide: AVAILABILITY_REPOSITORY,
      useExisting: PrismaAvailabilityRepository,
    },
    PrismaFavoritesRepository,
    { provide: FAVORITES_REPOSITORY, useExisting: PrismaFavoritesRepository },
    PrismaUsersRepository,
    { provide: USERS_REPOSITORY, useExisting: PrismaUsersRepository },
  ],
  exports: [
    PrismaService,
    PrismaHotelsRepository,
    HOTELS_REPOSITORY,
    PrismaAvailabilityRepository,
    AVAILABILITY_REPOSITORY,
    PrismaFavoritesRepository,
    FAVORITES_REPOSITORY,
    PrismaUsersRepository,
    USERS_REPOSITORY,
  ],
})
export class PrismaModule {}
