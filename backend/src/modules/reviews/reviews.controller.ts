import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { zodPipe } from '../../common/pipes/zod-validation.pipe.js';
import { contractRef } from '../hotels/dto/hotel-search.api.js';
import {
  bookingIdParamSchema,
  createReviewSchema,
  reviewListQuerySchema,
  type BookingIdParam,
  type CreateReviewDto,
  type ReviewableData,
  type ReviewDto,
  type ReviewListData,
  type ReviewListQuery,
} from './dto/review.dto.js';
import { ReviewsService } from './reviews.service.js';

/**
 * T24 — the review routes. Thin on purpose: parse, delegate.
 *
 * Only the list is `@Public()`: it renders on the public hotel detail page. Writing
 * and the reviewable check both default to authenticated, and the caller is always the
 * JWT subject — no route reads a caller id from a body or a query string.
 */
@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  // Explicit `@Inject`: tsx/esbuild never emits `design:paramtypes`
  // (see PrismaService), so inference would break the OpenAPI preview.
  constructor(
    @Inject(ReviewsService) private readonly reviews: ReviewsService,
  ) {}

  @Post('hotels/:hotelId/reviews')
  @ApiOperation({
    summary: 'Review a completed stay',
    description:
      'One review per booking, written only by the booking\u2019s owner and only once the ' +
      'stay is COMPLETED. A confirmed-but-not-stayed booking answers 400 ' +
      '`INVALID_REVIEW_STATE`; a second review for the same stay answers 409 ' +
      '`ALREADY_REVIEWED`. Unknown emails and wrong passwords share one code elsewhere; ' +
      'here unknown bookings and other guests\u2019 bookings stay distinguishable ' +
      '(404 vs 403) exactly like the booking routes, because the form branches on them.',
  })
  @ApiParam({
    name: 'hotelId',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The hotel the stay was at, by uuid.',
  })
  @ApiBody({ schema: { $ref: contractRef('CreateReview') } })
  @ApiResponse({
    status: 201,
    description: 'The review that was created, VISIBLE immediately.',
    schema: { $ref: contractRef('ReviewEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The body failed validation, or the stay is not COMPLETED.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'The booking belongs to a different guest.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such booking, or not for this hotel.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 409,
    description: 'This stay already has a review.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  create(
    @CurrentUser('id') callerId: string,
    @Param('hotelId') hotelId: string,
    @Body(zodPipe(createReviewSchema)) body: CreateReviewDto,
  ): Promise<ReviewDto> {
    return this.reviews.create(callerId, hotelId, body);
  }

  @Get('hotels/:hotelId/reviews')
  @Public()
  @ApiOperation({
    summary: 'A hotel\u2019s visible reviews, newest first',
    description:
      'Public, like the detail page that renders it. Only VISIBLE rows; hidden ones are ' +
      'T25 moderation\u2019s to surface, not this list\u2019s. The average is over the same ' +
      'VISIBLE set, so the breakdown and the number above it can never disagree.',
  })
  @ApiParam({
    name: 'hotelId',
    required: true,
    type: String,
    description: 'The hotel, by uuid or slug — the same identifier the detail route takes.',
  })
  @ApiResponse({
    status: 200,
    description: 'The page, the total, and the 1–5 average (null when unreviewed).',
    schema: { $ref: contractRef('ReviewListEnvelope') },
  })
  @ApiResponse({
    status: 400,
    description: 'The query string failed validation.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such hotel.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  list(
    @Param('hotelId') hotelId: string,
    @Query(zodPipe(reviewListQuerySchema)) query: ReviewListQuery,
  ): Promise<ReviewListData> {
    return this.reviews.list(hotelId, query.page, query.pageSize);
  }

  @Get('bookings/:id/reviewable')
  @ApiOperation({
    summary: 'Whether the caller may review this booking right now',
    description:
      'The review form\u2019s gate: it renders only on `{ canReview: true }`, and the ' +
      '`reason` selects the message otherwise. A non-completed stay or an existing ' +
      'review is data here, not an error — the 404/403/400/409 answers belong to the ' +
      'write, not to the question.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'The booking, by uuid.',
  })
  @ApiResponse({
    status: 200,
    description: 'The verdict, with a machine-readable reason when negative.',
    schema: { $ref: contractRef('ReviewableEnvelope') },
  })
  @ApiResponse({
    status: 401,
    description: 'No valid session.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 403,
    description: 'The booking belongs to a different guest.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  @ApiResponse({
    status: 404,
    description: 'No such booking.',
    schema: { $ref: contractRef('ApiErrorEnvelope') },
  })
  reviewable(
    @CurrentUser('id') callerId: string,
    @Param(zodPipe(bookingIdParamSchema)) params: BookingIdParam,
  ): Promise<ReviewableData> {
    return this.reviews.reviewable(callerId, params.id);
  }
}
