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
import { CoachDirectoryService } from './coach-directory.service';
import { QueryDirectoryDto } from './dto/query-directory.dto';
import { ClientJwtAuthGuard, CurrentClient, Public } from '../auth';

// @Public() only skips the global coach-JWT guard; browsing still requires a
// signed-in client so each card can report whether they already have a
// relationship with that coach.
@Public()
@ApiTags('Coach Directory')
@ApiBearerAuth()
@UseGuards(ClientJwtAuthGuard)
@Controller('coaches/directory')
export class CoachDirectoryController {
	constructor(private readonly directoryService: CoachDirectoryService) {}

	@Get()
	@ApiOperation({ summary: 'Browse coaches accepting new clients' })
	@ApiResponse({ status: 200, description: 'Coaches retrieved' })
	@HttpCode(HttpStatus.OK)
	browse(
		@Query() query: QueryDirectoryDto,
		@CurrentClient('clientId') clientId: string,
	) {
		return this.directoryService.browse(query, clientId);
	}

	@Get(':tenantId')
	@ApiOperation({ summary: 'View a single coach profile' })
	@ApiResponse({ status: 200, description: 'Coach retrieved' })
	@ApiResponse({ status: 404, description: 'Coach not found' })
	@HttpCode(HttpStatus.OK)
	findOne(
		@Param('tenantId', ParseUUIDPipe) tenantId: string,
		@CurrentClient('clientId') clientId: string,
	) {
		return this.directoryService.findOne(tenantId, clientId);
	}
}
