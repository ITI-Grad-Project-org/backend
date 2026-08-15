import {
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Query,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant, JwtAuthGuard } from '../auth';
import { QueryMeasurementsDto } from './dto/query-measurements.dto';
import { MeasurementsService } from './measurements.service';

@ApiTags('Measurements (coach)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('client/:clientId/measurements')
export class CoachMeasurementsController {
	constructor(private readonly measurementsService: MeasurementsService) {}

	@Get()
	@ApiOperation({ summary: 'List measurements for one client in my tenant' })
	@ApiResponse({ status: 200, description: 'Measurements retrieved' })
	@ApiResponse({ status: 404, description: 'Client not found in this tenant' })
	@HttpCode(HttpStatus.OK)
	findAll(
		@CurrentTenant() tenantId: string,
		@Param('clientId', ParseUUIDPipe) clientId: string,
		@Query() query: QueryMeasurementsDto,
	) {
		return this.measurementsService.findClientMeasurementsForCoach(
			tenantId,
			clientId,
			query,
		);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get one client measurement in my tenant' })
	@ApiResponse({ status: 200, description: 'Measurement retrieved' })
	@ApiResponse({ status: 404, description: 'Measurement not found' })
	@HttpCode(HttpStatus.OK)
	findOne(
		@CurrentTenant() tenantId: string,
		@Param('clientId', ParseUUIDPipe) clientId: string,
		@Param('id', ParseUUIDPipe) measurementId: string,
	) {
		return this.measurementsService.findSingleMeasurementForCoach(
			tenantId,
			clientId,
			measurementId,
		);
	}
}
