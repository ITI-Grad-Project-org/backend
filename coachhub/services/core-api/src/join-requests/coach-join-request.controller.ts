import {
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { JoinRequestService } from './join-request.service';
import { CurrentTenant } from '../auth';

@ApiTags('Join Requests')
@ApiBearerAuth()
@Controller('join-requests')
export class CoachJoinRequestController {
	constructor(private readonly joinRequestService: JoinRequestService) {}

	@Get()
	@ApiOperation({ summary: 'List clients waiting on a decision in my tenant' })
	@ApiResponse({ status: 200, description: 'Requests retrieved' })
	@HttpCode(HttpStatus.OK)
	findAll(@CurrentTenant() tenantId: string) {
		return this.joinRequestService.listForTenant(tenantId);
	}

	@Post(':id/approve')
	@ApiOperation({ summary: 'Approve a request and activate the membership' })
	@ApiResponse({ status: 200, description: 'Request approved' })
	@ApiResponse({
		status: 404,
		description: 'Pending request not found in this tenant',
	})
	@HttpCode(HttpStatus.OK)
	approve(
		@CurrentTenant() tenantId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		return this.joinRequestService.decide(tenantId, id, true);
	}

	@Post(':id/reject')
	@ApiOperation({ summary: 'Turn down a request' })
	@ApiResponse({ status: 200, description: 'Request rejected' })
	@ApiResponse({
		status: 404,
		description: 'Pending request not found in this tenant',
	})
	@HttpCode(HttpStatus.OK)
	reject(
		@CurrentTenant() tenantId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		return this.joinRequestService.decide(tenantId, id, false);
	}
}
