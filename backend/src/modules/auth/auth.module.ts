import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PasswordService } from './password.service.js';
import { RolesGuard } from './roles.guard.js';
import { GithubStrategy } from './strategies/github.strategy.js';
import { GoogleStrategy } from './strategies/google.strategy.js';

/**
 * T14 + T15 — auth wiring.
 *
 * The guards are NOT `APP_GUARD` providers here on purpose: they are wired
 * manually in `bootstrap.ts configureApp` (like the envelope interceptor and
 * the exception filter), so the OpenAPI preview build — which never calls
 * `configureApp` — does not have to resolve them. Order is authentication
 * first (`JwtAuthGuard`), authorization second (`RolesGuard`).
 */
@Module({
  imports: [PrismaModule, UsersModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    GoogleStrategy,
    GithubStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, PasswordService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
