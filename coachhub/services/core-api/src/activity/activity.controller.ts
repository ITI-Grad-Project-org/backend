import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClientJwtAuthGuard, CurrentClient, Public } from '../auth';
import { ActivityGraphQueryDto } from './dto/activity-graph-query.dto';
import { ActivityGraphResponseDto } from './dto/activity-graph-response.dto';
import { ActivityGraphService } from './services/activity-graph.service';

@ApiTags('Client Activity')
@ApiBearerAuth()
@Public()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me/activity')
export class ActivityController {
	constructor(private readonly activityGraphService: ActivityGraphService) {}

	@Get()
	@ApiOperation({ summary: 'Get my global activity graph' })
	@ApiOkResponse({
		description: 'Global client activity graph retrieved',
		type: ActivityGraphResponseDto,
	})
	@ApiBadRequestResponse({ description: 'The selected year is invalid' })
	@ApiUnauthorizedResponse({ description: 'A valid client token is required' })
	getActivityGraph(
		@CurrentClient('clientId') clientId: string,
		@Query() query: ActivityGraphQueryDto,
	) {
		return this.activityGraphService.getActivityGraph(clientId, query.year);
	}
}
