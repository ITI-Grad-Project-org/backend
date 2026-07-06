import {
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant, Public } from '../auth';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@Controller()
export class ReviewsController {
	constructor(private readonly reviewsService: ReviewsService) {}

	@Get('reviews/me')
	@ApiBearerAuth()
	@ApiOperation({ summary: 'List reviews for my coach tenant' })
	@ApiResponse({ status: 200, description: 'Reviews retrieved' })
	@HttpCode(HttpStatus.OK)
	findMine(@CurrentTenant() tenantId: string) {
		return this.reviewsService.findTenantReviewsForCoach(tenantId);
	}

	@Public()
	@Get('reviews/coaches/:tenantId')
	@ApiOperation({ summary: 'List public reviews for a coach tenant' })
	@ApiResponse({ status: 200, description: 'Public reviews retrieved' })
	@HttpCode(HttpStatus.OK)
	findPublicCoachReviews(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
		return this.reviewsService.findPublicCoachReviews(tenantId);
	}

	@Public()
	@Get('reviews/coaches/:tenantId/summary')
	@ApiOperation({ summary: 'Get public rating summary for a coach tenant' })
	@ApiResponse({ status: 200, description: 'Rating summary retrieved' })
	@HttpCode(HttpStatus.OK)
	getPublicCoachReviewSummary(
		@Param('tenantId', ParseUUIDPipe) tenantId: string,
	) {
		return this.reviewsService.getPublicCoachReviewSummary(tenantId);
	}

	@Public()
	@Get('coaches/:tenantId/profile')
	@ApiOperation({ summary: 'Get public coach profile with rating and reviews' })
	@ApiResponse({ status: 200, description: 'Coach profile retrieved' })
	@HttpCode(HttpStatus.OK)
	getPublicCoachProfile(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
		return this.reviewsService.getPublicCoachProfile(tenantId);
	}
}
