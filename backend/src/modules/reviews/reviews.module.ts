import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';
import { PrismaReviewsRepository } from '../../prisma/prisma-reviews.repository.js';
import { REVIEWS_REPOSITORY } from '../../prisma/reviews.repository.js';

@Module({
  controllers: [ReviewsController],
  providers: [
    ReviewsService,
    { provide: REVIEWS_REPOSITORY, useClass: PrismaReviewsRepository },
  ],
  exports: [ReviewsService, REVIEWS_REPOSITORY],
})
export class ReviewsModule {}
