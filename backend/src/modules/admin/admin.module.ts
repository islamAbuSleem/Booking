import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { PrismaAdminRepository } from '../../prisma/prisma-admin.repository.js';
import { ADMIN_REPOSITORY } from '../../prisma/admin.repository.js';

@Module({
  controllers: [AdminController],
  providers: [
    AdminService,
    { provide: ADMIN_REPOSITORY, useClass: PrismaAdminRepository },
  ],
  exports: [AdminService, ADMIN_REPOSITORY],
})
export class AdminModule {}
