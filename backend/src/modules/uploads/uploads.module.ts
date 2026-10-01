import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CLOUDINARY, RestCloudinaryClient } from './cloudinary.client.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

/**
 * T21 — owns the upload routes. `PrismaModule` is imported for the `UPLOADS_REPOSITORY`
 * binding it exports; `ConfigService` is global, so the Cloudinary credentials are read
 * directly. The one Cloudinary call sits behind the `CLOUDINARY` token, bound to the real
 * `RestCloudinaryClient` here and faked in tests — no Cloudinary SDK in the tree.
 */
@Module({
  imports: [PrismaModule],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    RestCloudinaryClient,
    { provide: CLOUDINARY, useExisting: RestCloudinaryClient },
  ],
})
export class UploadsModule {}
