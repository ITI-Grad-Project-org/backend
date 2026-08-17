import {
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Query,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant, JwtAuthGuard } from '../auth';
import { ClientMembershipService } from './client-membership.service';
import { QueryMembershipsDto } from './dto/query-memberships.dto';

@ApiTags('Coach - Memberships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('memberships')
export class MembershipsController {
	constructor(private readonly membershipService: ClientMembershipService) {}

	@Get()
	@ApiOperation({
		summary: 'List the memberships in my tenant',
		description:
			'The coach-facing client roster, newest first. Returns `membershipId` — ' +
			'the id every other coach endpoint is keyed on, including plan ' +
			'suggestions, measurements, programs and nutrition plans. Filter by ' +
			'`status` for just the active ones, or `search` by name or email. ' +
			'`hasIntake` says whether there is a questionnaire on file, which is ' +
			'what decides how specific an AI-generated plan can be.',
	})
	@ApiOkResponse({ description: 'Memberships retrieved' })
	@ApiBadRequestResponse({ description: 'Invalid query parameters' })
	@HttpCode(HttpStatus.OK)
	findAll(
		@CurrentTenant() tenantId: string,
		@Query() query: QueryMembershipsDto,
	) {
		return this.membershipService.listTenantMemberships(tenantId, query);
	}
}
