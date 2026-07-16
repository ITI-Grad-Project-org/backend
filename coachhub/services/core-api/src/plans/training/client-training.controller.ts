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
import { CurrentClient, CurrentTenant, Public } from '../../auth';
import { ClientJwtAuthGuard } from '../../auth/guards/client-jwt-auth.guard';
import { ClientTrainingCalendarQueryDto } from './dto/client-calendar-query.dto';
import {
	CreateExtraLoggedSetDto,
	UpdatePrescribedLoggedSetDto,
} from './dto/workout-logging.dto';
import { ClientTrainingProgramsService } from './services/client-training-programs.service';
import { ClientWorkoutLogsService } from './services/client-workout-logs.service';

@ApiTags('client/me/training')
@ApiBearerAuth()
@Public()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me/training')
export class ClientTrainingController {
	constructor(
		private readonly clientTrainingProgramsService: ClientTrainingProgramsService,
		private readonly clientWorkoutLogsService: ClientWorkoutLogsService,
	) {}

	@Get('programs')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'List my published training programs' })
	@ApiResponse({ status: 200, description: 'Published programs retrieved' })
	listPrograms(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
	) {
		return this.clientTrainingProgramsService.listPublishedPrograms(
			clientId,
			tenantId,
		);
	}

	@Get('programs/current')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get my currently active training program' })
	@ApiResponse({ status: 200, description: 'Current program retrieved' })
	@ApiResponse({ status: 404, description: 'Current program not found' })
	getCurrentProgram(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
	) {
		return this.clientTrainingProgramsService.getCurrentPublishedProgram(
			clientId,
			tenantId,
		);
	}

	@Get('programs/:programId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get my complete published training program' })
	@ApiResponse({ status: 200, description: 'Published program retrieved' })
	@ApiResponse({ status: 404, description: 'Published program not found' })
	getProgram(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
	) {
		return this.clientTrainingProgramsService.getPublishedProgram(
			clientId,
			tenantId,
			programId,
		);
	}

	@Get('calendar')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get my training calendar in an inclusive range' })
	@ApiResponse({ status: 200, description: 'Training calendar retrieved' })
	@ApiResponse({ status: 400, description: 'Invalid calendar range' })
	getCalendar(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Query() query: ClientTrainingCalendarQueryDto,
	) {
		return this.clientTrainingProgramsService.getCalendar(
			clientId,
			tenantId,
			query,
		);
	}

	@Get('days/:programDayId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get one published training day prescription' })
	@ApiResponse({ status: 200, description: 'Training day retrieved' })
	@ApiResponse({ status: 404, description: 'Training day not found' })
	getDay(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('programDayId', ParseUUIDPipe) programDayId: string,
	) {
		return this.clientTrainingProgramsService.getPublishedDay(
			clientId,
			tenantId,
			programDayId,
		);
	}

	@Post('days/:programDayId/log')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Start or resume one prescribed workout log' })
	@ApiResponse({ status: 200, description: 'Workout log started or resumed' })
	@ApiResponse({ status: 404, description: 'Owned program day not found' })
	@ApiResponse({ status: 409, description: 'Program day cannot be logged' })
	startOrResumeWorkout(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('programDayId', ParseUUIDPipe) programDayId: string,
	) {
		return this.clientWorkoutLogsService.startOrResumeWorkout(
			clientId,
			tenantId,
			programDayId,
		);
	}

	@Patch('logs/:logId/sets/:loggedSetId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Submit actual results for one prescribed set' })
	@ApiResponse({ status: 200, description: 'Prescribed set result updated' })
	@ApiResponse({
		status: 404,
		description: 'Owned workout log or set not found',
	})
	@ApiResponse({ status: 409, description: 'Workout log is finalized' })
	updatePrescribedSet(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('logId', ParseUUIDPipe) logId: string,
		@Param('loggedSetId', ParseUUIDPipe) loggedSetId: string,
		@Body() body: UpdatePrescribedLoggedSetDto,
	) {
		return this.clientWorkoutLogsService.updatePrescribedSet(
			clientId,
			tenantId,
			logId,
			loggedSetId,
			body,
		);
	}

	@Post('logs/:logId/extra-sets')
	@ApiOperation({ summary: 'Add an extra set to a prescribed logged exercise' })
	@ApiResponse({ status: 201, description: 'Extra set created' })
	@ApiResponse({ status: 404, description: 'Owned workout log not found' })
	@ApiResponse({ status: 409, description: 'Workout log is finalized' })
	addExtraSet(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('logId', ParseUUIDPipe) logId: string,
		@Body() body: CreateExtraLoggedSetDto,
	) {
		return this.clientWorkoutLogsService.addExtraSet(
			clientId,
			tenantId,
			logId,
			body,
		);
	}

	@Delete('logs/:logId/extra-sets/:loggedSetId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Remove an extra set from an in-progress log' })
	@ApiResponse({ status: 200, description: 'Extra set removed' })
	@ApiResponse({
		status: 404,
		description: 'Owned workout log or set not found',
	})
	@ApiResponse({ status: 409, description: 'Workout log is finalized' })
	removeExtraSet(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('logId', ParseUUIDPipe) logId: string,
		@Param('loggedSetId', ParseUUIDPipe) loggedSetId: string,
	) {
		return this.clientWorkoutLogsService.removeExtraSet(
			clientId,
			tenantId,
			logId,
			loggedSetId,
		);
	}
}
