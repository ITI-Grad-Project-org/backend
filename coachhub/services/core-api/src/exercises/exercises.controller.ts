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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentTenant, CurrentUser } from 'src/auth';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { QueryExercisesDto } from './dto/query-exercises.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { ExercisesService } from './exercises.service';

@ApiTags('coach/exercises')
@ApiBearerAuth()
@Controller('exercises')
export class ExercisesController {
	constructor(private readonly exerciseService: ExercisesService) {}
	@Post('/initialize-library-from-defaults')
	initializeLibrary(@CurrentTenant() tenantId: string | null) {
		return this.exerciseService.initializeCoachLibrary(tenantId);
	}

	@Post()
	addExerciseToLibrary(
		@CurrentTenant() tenantId: string,
		@CurrentUser('userId') coachId: string,
		@Body() body: CreateExerciseDto,
	) {
		return this.exerciseService.addExerciseToLibrary(tenantId, coachId, body);
	}

	@Get()
	findLibraryExercises(
		@CurrentTenant() tenantId: string,
		@Query() query: QueryExercisesDto,
	) {
		return this.exerciseService.getAllLibraryExercises(tenantId, query);
	}

	@Get(':exerciseId')
	findLibraryExercise(
		@CurrentTenant() tenantId: string,
		@Param('exerciseId', ParseUUIDPipe) exerciseId: string,
	) {
		return this.exerciseService.getLibraryExercise(tenantId, exerciseId);
	}

	@Patch(':exerciseId')
	updateLibraryExercise(
		@CurrentTenant() tenantId: string,
		@Param('exerciseId', ParseUUIDPipe) exerciseId: string,
		@Body() body: UpdateExerciseDto,
	) {
		return this.exerciseService.updateLibraryExercise(
			tenantId,
			exerciseId,
			body,
		);
	}

	@Delete(':exerciseId')
	@HttpCode(HttpStatus.OK)
	archiveLibraryExercise(
		@CurrentTenant() tenantId: string,
		@Param('exerciseId', ParseUUIDPipe) exerciseId: string,
	) {
		return this.exerciseService.archiveLibraryExercise(tenantId, exerciseId);
	}
}
