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
	Put,
	Query,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant, CurrentUser } from '../../auth';
import {
	CreateClientProgramDto,
	UpdateClientProgramDto,
} from './dto/create-client-program.dto';
import { PrescribeExerciseDto } from './dto/prescribe-exercise.dto';
import { RescheduleClientProgramDto } from './dto/program-lifecycle.dto';
import { QueryClientProgramsDto } from './dto/query-client-programs.dto';
import {
	CreateAndPrescribeExerciseDto,
	ReplacePlannedSetsDto,
	UpdatePlannedExerciseDto,
	UpdateProgramDayDto,
} from './dto/workout-builder.dto';
import { ClientProgramsService } from './services/client-programs.service';
import { PlannedExercisesService } from './services/planned-exercises.service';
import { ProgramDaysService } from './services/program-days.service';
import { ProgramLifecycleService } from './services/program-lifecycle.service';
import { WorkoutLogReviewService } from './services/workout-log-review.service';

@ApiTags('coach/client-training-programs')
@ApiBearerAuth()
@Controller('plans/training/client-programs')
export class TrainingController {
	constructor(
		private readonly clientProgramsService: ClientProgramsService,
		private readonly programDaysService: ProgramDaysService,
		private readonly plannedExercisesService: PlannedExercisesService,
		private readonly programLifecycleService: ProgramLifecycleService,
		private readonly workoutLogReviewService: WorkoutLogReviewService,
	) {}

	@Post()
	@ApiOperation({ summary: 'Create a dated client workout-program draft' })
	@ApiResponse({ status: 201, description: 'Client program draft created' })
	createClientProgram(
		@CurrentTenant() tenantId: string | null,
		@CurrentUser('userId') coachId: string,
		@Body() body: CreateClientProgramDto,
	) {
		return this.clientProgramsService.createClientProgram(
			tenantId,
			coachId,
			body,
		);
	}

	@Get()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'List client workout programs in my tenant' })
	@ApiResponse({ status: 200, description: 'Client programs retrieved' })
	findClientPrograms(
		@CurrentTenant() tenantId: string | null,
		@Query() query: QueryClientProgramsDto,
	) {
		return this.clientProgramsService.findClientPrograms(tenantId, query);
	}

	@Get(':programId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Get the ordered dated client-program builder tree',
	})
	@ApiResponse({ status: 200, description: 'Client program retrieved' })
	@ApiResponse({ status: 404, description: 'Client program not found' })
	getClientProgram(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
	) {
		return this.clientProgramsService.getClientProgram(tenantId, programId);
	}

	@Get(':programId/logs')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Review all workout logs for a client program' })
	@ApiResponse({ status: 200, description: 'Program workout logs retrieved' })
	@ApiResponse({ status: 404, description: 'Client program not found' })
	listProgramLogs(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
	) {
		return this.workoutLogReviewService.listProgramLogs(tenantId, programId);
	}

	@Get(':programId/days/:programDayId/log')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Review one prescribed day beside its canonical workout log',
	})
	@ApiResponse({ status: 200, description: 'Program day review retrieved' })
	@ApiResponse({ status: 404, description: 'Client program day not found' })
	getProgramDayLog(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
		@Param('programDayId', ParseUUIDPipe) programDayId: string,
	) {
		return this.workoutLogReviewService.getProgramDayLog(
			tenantId,
			programId,
			programDayId,
		);
	}

	@Patch(':programId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Update client-program draft metadata or start date',
	})
	@ApiResponse({ status: 200, description: 'Client program draft updated' })
	@ApiResponse({ status: 404, description: 'Client program not found' })
	@ApiResponse({ status: 409, description: 'Program is no longer a draft' })
	updateClientProgram(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
		@Body() body: UpdateClientProgramDto,
	) {
		return this.clientProgramsService.updateClientProgram(
			tenantId,
			programId,
			body,
		);
	}

	@Post(':programId/publish')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Publish a complete client-program draft' })
	@ApiResponse({ status: 200, description: 'Client program published' })
	@ApiResponse({ status: 400, description: 'Program is incomplete' })
	@ApiResponse({ status: 409, description: 'Lifecycle or overlap conflict' })
	publishClientProgram(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
	) {
		return this.programLifecycleService.publishClientProgram(
			tenantId,
			programId,
		);
	}

	@Post(':programId/reschedule')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Reschedule a future published client program' })
	@ApiResponse({ status: 200, description: 'Client program rescheduled' })
	@ApiResponse({ status: 409, description: 'Lifecycle or overlap conflict' })
	rescheduleClientProgram(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
		@Body() body: RescheduleClientProgramDto,
	) {
		return this.programLifecycleService.rescheduleClientProgram(
			tenantId,
			programId,
			body,
		);
	}

	@Post(':programId/cancel')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Cancel a client program' })
	@ApiResponse({ status: 200, description: 'Client program cancelled' })
	@ApiResponse({ status: 409, description: 'Program is already cancelled' })
	cancelClientProgram(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
	) {
		return this.programLifecycleService.cancelClientProgram(
			tenantId,
			programId,
		);
	}

	@Delete(':programId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Archive a client program from normal coach lists' })
	@ApiResponse({ status: 200, description: 'Client program archived' })
	archiveClientProgram(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
	) {
		return this.programLifecycleService.archiveClientProgram(
			tenantId,
			programId,
		);
	}

	@Post(':programId/unarchive')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Restore an archived client program to coach lists' })
	@ApiResponse({ status: 200, description: 'Client program unarchived' })
	@ApiResponse({ status: 404, description: 'Client program not found' })
	unarchiveClientProgram(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
	) {
		return this.programLifecycleService.unarchiveClientProgram(
			tenantId,
			programId,
		);
	}

	@Patch(':programId/days/:programDayId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Update a workout day title, notes, or rest status',
	})
	@ApiResponse({ status: 200, description: 'Program day updated' })
	@ApiResponse({ status: 400, description: 'Invalid day update' })
	@ApiResponse({ status: 404, description: 'Editable program day not found' })
	@ApiResponse({ status: 409, description: 'Rest or published-day conflict' })
	updateProgramDay(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
		@Param('programDayId', ParseUUIDPipe) programDayId: string,
		@Body() body: UpdateProgramDayDto,
	) {
		return this.programDaysService.updateProgramDay(
			tenantId,
			programId,
			programDayId,
			body,
		);
	}

	@Post(':programId/days/:programDayId/exercises/from-library')
	@ApiOperation({ summary: 'Add a tenant library exercise to a workout day' })
	@ApiResponse({ status: 201, description: 'Exercise prescription added' })
	@ApiResponse({ status: 400, description: 'Invalid prescription or position' })
	@ApiResponse({
		status: 404,
		description: 'Program day or exercise not found',
	})
	@ApiResponse({ status: 409, description: 'Rest or published-day conflict' })
	addExerciseFromLibrary(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
		@Param('programDayId', ParseUUIDPipe) programDayId: string,
		@Body() body: PrescribeExerciseDto,
	) {
		return this.plannedExercisesService.addExerciseFromLibrary(
			tenantId,
			programId,
			programDayId,
			body,
		);
	}

	@Post(':programId/days/:programDayId/exercises/create-in-library')
	@ApiOperation({
		summary: 'Create a reusable library exercise and add its prescription',
	})
	@ApiResponse({ status: 201, description: 'Exercise created and prescribed' })
	@ApiResponse({ status: 400, description: 'Invalid exercise or prescription' })
	@ApiResponse({ status: 404, description: 'Editable program day not found' })
	@ApiResponse({
		status: 409,
		description: 'Rest-day or duplicate-name conflict',
	})
	createLibraryExerciseAndAdd(
		@CurrentTenant() tenantId: string | null,
		@CurrentUser('userId') coachId: string,
		@Param('programId', ParseUUIDPipe) programId: string,
		@Param('programDayId', ParseUUIDPipe) programDayId: string,
		@Body() body: CreateAndPrescribeExerciseDto,
	) {
		return this.plannedExercisesService.createLibraryExerciseAndAdd(
			tenantId,
			coachId,
			programId,
			programDayId,
			body,
		);
	}

	@Patch(':programId/exercises/:plannedExerciseId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Update or reorder a planned exercise' })
	@ApiResponse({ status: 200, description: 'Planned exercise updated' })
	@ApiResponse({ status: 400, description: 'Invalid position or prescription' })
	@ApiResponse({ status: 404, description: 'Planned exercise not found' })
	@ApiResponse({ status: 409, description: 'Published-day edit conflict' })
	updatePlannedExercise(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
		@Param('plannedExerciseId', ParseUUIDPipe) plannedExerciseId: string,
		@Body() body: UpdatePlannedExerciseDto,
	) {
		return this.plannedExercisesService.updatePlannedExercise(
			tenantId,
			programId,
			plannedExerciseId,
			body,
		);
	}

	@Put(':programId/exercises/:plannedExerciseId/sets')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Replace every prescribed set for an exercise' })
	@ApiResponse({ status: 200, description: 'Prescribed sets replaced' })
	@ApiResponse({ status: 400, description: 'Invalid set prescriptions' })
	@ApiResponse({ status: 404, description: 'Planned exercise not found' })
	@ApiResponse({ status: 409, description: 'Published-day edit conflict' })
	replacePlannedSets(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
		@Param('plannedExerciseId', ParseUUIDPipe) plannedExerciseId: string,
		@Body() body: ReplacePlannedSetsDto,
	) {
		return this.plannedExercisesService.replacePlannedSets(
			tenantId,
			programId,
			plannedExerciseId,
			body,
		);
	}

	@Delete(':programId/exercises/:plannedExerciseId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Delete a planned exercise and compact positions' })
	@ApiResponse({ status: 200, description: 'Planned exercise deleted' })
	@ApiResponse({ status: 404, description: 'Planned exercise not found' })
	@ApiResponse({ status: 409, description: 'Published-day edit conflict' })
	deletePlannedExercise(
		@CurrentTenant() tenantId: string | null,
		@Param('programId', ParseUUIDPipe) programId: string,
		@Param('plannedExerciseId', ParseUUIDPipe) plannedExerciseId: string,
	) {
		return this.plannedExercisesService.deletePlannedExercise(
			tenantId,
			programId,
			plannedExerciseId,
		);
	}
}
