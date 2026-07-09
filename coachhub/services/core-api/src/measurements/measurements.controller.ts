import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentClient, CurrentTenant, Public } from '../auth';
import { ClientJwtAuthGuard } from '../auth/guards/client-jwt-auth.guard';
import { CreateMeasurementDto } from './dto/create-measurement.dto';
import { QueryMeasurementsDto } from './dto/query-measurements.dto';
import { UpdateMeasurementDto } from './dto/update-measurement.dto';
import { MeasurementsService } from './measurements.service';

@ApiTags('client/me/measurements')
@ApiBearerAuth()
@Public()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me/measurements')
export class MeasurementsController {
	constructor(private readonly measurementsService: MeasurementsService) {}

	@Post()
	@ApiOperation({ summary: 'Create a current client measurement log' })
	@ApiResponse({ status: 201, description: 'Measurement created' })
	@ApiResponse({
		status: 400,
		description: 'Client has no active tenant selected',
	})
	@ApiResponse({
		status: 404,
		description: 'Active client membership not found',
	})
	@ApiResponse({
		status: 409,
		description: 'Measurement already exists for this date',
	})
	create(
		@Body() body: CreateMeasurementDto,
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
	) {
		return this.measurementsService.createClientMeasurement(
			clientId,
			tenantId,
			body,
		);
	}

	@Get()
	@ApiOperation({ summary: 'List current client measurements' })
	@ApiResponse({ status: 200, description: 'Measurements retrieved' })
	@ApiResponse({
		status: 400,
		description: 'Client has no active tenant selected',
	})
	@ApiResponse({
		status: 404,
		description: 'Active client membership not found',
	})
	@HttpCode(HttpStatus.OK)
	findAll(
		@Query() query: QueryMeasurementsDto,
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
	) {
		return this.measurementsService.findClientMeasurements(
			clientId,
			tenantId,
			query,
		);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a current client measurement log' })
	@ApiResponse({ status: 200, description: 'Measurement retrieved' })
	@ApiResponse({
		status: 400,
		description: 'Client has no active tenant selected',
	})
	@ApiResponse({ status: 404, description: 'Measurement not found' })
	@HttpCode(HttpStatus.OK)
	findOne(
		@Param('id', ParseUUIDPipe) measurementId: string,
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
	) {
		return this.measurementsService.findSingleMeasurement(
			clientId,
			tenantId,
			measurementId,
		);
	}

	@Patch(':id')
	@ApiOperation({ summary: 'Update a current client measurement log' })
	@ApiResponse({ status: 200, description: 'Measurement updated' })
	@ApiResponse({
		status: 400,
		description: 'Client has no active tenant selected',
	})
	@ApiResponse({ status: 404, description: 'Measurement not found' })
	@ApiResponse({
		status: 409,
		description: 'Measurement already exists for this date',
	})
	@HttpCode(HttpStatus.OK)
	update(
		@Param('id', ParseUUIDPipe) measurementId: string,
		@Body() body: UpdateMeasurementDto,
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
	) {
		return this.measurementsService.updateClientMeasurement(
			clientId,
			tenantId,
			measurementId,
			body,
		);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a current client measurement log' })
	@ApiResponse({ status: 200, description: 'Measurement deleted' })
	@ApiResponse({
		status: 400,
		description: 'Client has no active tenant selected',
	})
	@ApiResponse({ status: 404, description: 'Measurement not found' })
	@HttpCode(HttpStatus.OK)
	remove(
		@Param('id', ParseUUIDPipe) measurementId: string,
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
	) {
		return this.measurementsService.deleteClientMeasurement(
			clientId,
			tenantId,
			measurementId,
		);
	}
}
