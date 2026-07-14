import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
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
import { QueryClientProgramsDto } from './dto/query-client-programs.dto';
import { TrainingService } from './training.service';

@ApiTags('coach/client-training-programs')
@ApiBearerAuth()
@Controller('plans/training/client-programs')
export class TrainingController {
	constructor(private readonly trainingService: TrainingService) {}

	@Post()
	@ApiOperation({ summary: 'Create a dated client workout-program draft' })
	@ApiResponse({ status: 201, description: 'Client program draft created' })
	createClientProgram(
		@CurrentTenant() tenantId: string | null,
		@CurrentUser('userId') coachId: string,
		@Body() body: CreateClientProgramDto,
	) {
		return this.trainingService.createClientProgram(tenantId, coachId, body);
	}

	@Get()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'List client workout programs in my tenant' })
	@ApiResponse({ status: 200, description: 'Client programs retrieved' })
	findClientPrograms(
		@CurrentTenant() tenantId: string | null,
		@Query() query: QueryClientProgramsDto,
	) {
		return this.trainingService.findClientPrograms(tenantId, query);
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
		return this.trainingService.getClientProgram(tenantId, programId);
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
		return this.trainingService.updateClientProgram(tenantId, programId, body);
	}
}
