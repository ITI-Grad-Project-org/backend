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
	UploadedFiles,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
	ApiBearerAuth,
	ApiBody,
	ApiConsumes,
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
import { fileUploadMulterOptions } from '../s3-upload/multer.config';

// Shared multipart shape for create/update: measurement fields as form fields
// (numbers coerced from strings) plus progress photos as `photos` file parts.
const MEASUREMENT_BODY_SCHEMA = {
	type: 'object' as const,
	properties: {
		measuredAt: { type: 'string', format: 'date', example: '2026-07-03' },
		weightKg: { type: 'number', example: 82.5 },
		bodyFatPct: { type: 'number', example: 18.5 },
		chestCm: { type: 'number', example: 102 },
		waistCm: { type: 'number', example: 84 },
		hipsCm: { type: 'number', example: 98 },
		armCm: { type: 'number', example: 36 },
		thighCm: { type: 'number', example: 58 },
		photos: {
			type: 'array',
			items: { type: 'string', format: 'binary' },
		},
	},
};

@ApiTags('client/me/measurements')
@ApiBearerAuth()
@Public()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me/measurements')
export class MeasurementsController {
	constructor(private readonly measurementsService: MeasurementsService) {}

	@Post()
	@ApiOperation({
		summary: 'Create a current client measurement log',
		description:
			'multipart/form-data — attach progress photos as `photos` file parts.',
	})
	@ApiConsumes('multipart/form-data')
	@ApiBody({ schema: MEASUREMENT_BODY_SCHEMA })
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
	@UseInterceptors(FilesInterceptor('photos', 20, fileUploadMulterOptions))
	create(
		@Body() body: CreateMeasurementDto,
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@UploadedFiles() photos: Express.Multer.File[] = [],
	) {
		return this.measurementsService.createClientMeasurement(
			clientId,
			tenantId,
			body,
			photos,
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
	@ApiOperation({
		summary: 'Update a current client measurement log',
		description:
			'multipart/form-data — sending `photos` files replaces the stored set.',
	})
	@ApiConsumes('multipart/form-data')
	@ApiBody({ schema: MEASUREMENT_BODY_SCHEMA })
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
	@UseInterceptors(FilesInterceptor('photos', 20, fileUploadMulterOptions))
	update(
		@Param('id', ParseUUIDPipe) measurementId: string,
		@Body() body: UpdateMeasurementDto,
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@UploadedFiles() photos: Express.Multer.File[] = [],
	) {
		return this.measurementsService.updateClientMeasurement(
			clientId,
			tenantId,
			measurementId,
			body,
			photos,
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
