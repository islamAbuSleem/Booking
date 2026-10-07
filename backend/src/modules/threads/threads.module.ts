import { Module } from '@nestjs/common';
import { ThreadsController } from './threads.controller.js';
import { ThreadsService } from './threads.service.js';

/**
 * T35 — owns the messaging logic. The thread routes live here; no other module has a
 * route into the conversation writes, and the repository bindings the service needs
 * are global (PrismaModule).
 */
@Module({
  controllers: [ThreadsController],
  providers: [ThreadsService],
})
export class ThreadsModule {}
