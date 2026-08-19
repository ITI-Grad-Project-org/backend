import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Query,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant, CurrentUser, JwtAuthGuard } from '../auth';
import { QueryMeasurementsDto } from './dto/query-measurements.dto';
import { ReviewMeasurementDto } from './dto/review-measurement.dto';
import { MeasurementsService } from './measurements.service';

@ApiTags('Measurements (coach review)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('measurements')
export class CoachMeasurementReviewsController {
	constructor(private readonly measurementsService: MeasurementsService) {}

	@Get('reviews/pending')
	@ApiOperation({ summary: 'List unreviewed measurements in my tenant' })
	@ApiResponse({ status: 200, description: 'Pending measurements retrieved' })
	@HttpCode(HttpStatus.OK)
	findPending(
		@CurrentTenant() tenantId: string,
		@Query() query: QueryMeasurementsDto,
	) {
		return this.measurementsService.findPendingMeasurementsForCoach(
			tenantId,
			query,
		);
	}

	@Patch(':measurementId/review')
	@ApiOperation({ summary: 'Mark a tenant measurement as reviewed' })
	@ApiResponse({ status: 200, description: 'Measurement reviewed' })
	@ApiResponse({ status: 404, description: 'Measurement not found' })
	@HttpCode(HttpStatus.OK)
	review(
		@CurrentTenant() tenantId: string,
		@CurrentUser('userId') coachId: string,
		@Param('measurementId', ParseUUIDPipe) measurementId: string,
		@Body() body: ReviewMeasurementDto,
	) {
		return this.measurementsService.reviewMeasurement(
			tenantId,
			coachId,
			measurementId,
			body,
		);
	}
}
