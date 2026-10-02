import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnv } from './config/env.js';
import { HealthModule } from './modules/health/health.module.js';
import { HotelsModule } from './modules/hotels/hotels.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { FavoritesModule } from './modules/favorites/favorites.module.js';
import { UploadsModule } from './modules/uploads/uploads.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { HostModule } from './modules/host/host.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    // Validated once, here. A missing or malformed required variable fails at boot
    // rather than at the first request that needs it.
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: parseEnv }),
    PrismaModule,
    UsersModule,
    AuthModule,
    BookingsModule,
    FavoritesModule,
    UploadsModule,
    HotelsModule,
    HostModule,
    ReviewsModule,
    AdminModule,
    PaymentsModule,
    HealthModule,
  ],
})
export class AppModule {}
