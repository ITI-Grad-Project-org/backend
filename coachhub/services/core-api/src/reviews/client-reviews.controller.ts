import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Patch,
	Post,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentClient, Public } from '../auth';
import { ClientJwtAuthGuard } from '../auth/guards/client-jwt-auth.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('client/me/reviews')
@ApiBearerAuth()
@Public()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me/reviews')
export class ClientReviewsController {
	constructor(private readonly reviewsService: ReviewsService) {}

	@Post()
	@ApiOperation({ summary: 'Create my review for the active coach tenant' })
	@ApiResponse({ status: 201, description: 'Review created' })
	create(
		@Body() dto: CreateReviewDto,
		@CurrentClient('clientId') clientId: string,
		@CurrentClient('tenantId') tenantId: string | null,
	) {
		return this.reviewsService.createClientReview(clientId, tenantId, dto);
	}

	@Get('current')
	@ApiOperation({ summary: 'Get my review for the active coach tenant' })
	@ApiResponse({ status: 200, description: 'Review retrieved' })
	@HttpCode(HttpStatus.OK)
	findCurrent(
		@CurrentClient('clientId') clientId: string,
		@CurrentClient('tenantId') tenantId: string | null,
	) {
		return this.reviewsService.getCurrentClientReview(clientId, tenantId);
	}

	@Patch()
	@ApiOperation({ summary: 'Update my review for the active coach tenant' })
	@ApiResponse({ status: 200, description: 'Review updated' })
	@HttpCode(HttpStatus.OK)
	update(
		@Body() dto: UpdateReviewDto,
		@CurrentClient('clientId') clientId: string,
		@CurrentClient('tenantId') tenantId: string | null,
	) {
		return this.reviewsService.updateClientReview(clientId, tenantId, dto);
	}

	@Delete()
	@ApiOperation({ summary: 'Delete my review for the active coach tenant' })
	@ApiResponse({ status: 200, description: 'Review deleted' })
	@HttpCode(HttpStatus.OK)
	remove(
		@CurrentClient('clientId') clientId: string,
		@CurrentClient('tenantId') tenantId: string | null,
	) {
		return this.reviewsService.deleteClientReview(clientId, tenantId);
	}
}
