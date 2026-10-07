import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThreadsController } from './threads.controller.js';
import { ThreadsGateway } from './threads.gateway.js';
import { ThreadsService } from './threads.service.js';

/**
 * T35 + T36 — owns the messaging logic and its live gateway. The thread routes live
 * here; no other module has a route into the conversation writes, and the repository
 * bindings the service needs are global (PrismaModule).
 *
 * `JwtModule` is registered here (not imported from `AuthModule`) so the gateway can
 * verify the session cookie without pulling in the auth controllers a second time.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [ThreadsController],
  providers: [ThreadsService, ThreadsGateway],
  exports: [ThreadsService],
})
export class ThreadsModule {}
