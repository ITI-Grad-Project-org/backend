import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant, CurrentUser } from '../auth';
import { AcceptPlanSuggestionDto } from './dto/accept-plan-suggestion.dto';
import { CreatePlanSuggestionDto } from './dto/create-plan-suggestion.dto';
import { DeclinePlanSuggestionDto } from './dto/decline-plan-suggestion.dto';
import { QueryPlanSuggestionsDto } from './dto/query-plan-suggestions.dto';
import { PlanSuggestionsService } from './plan-suggestions.service';

@ApiTags('coach/ai/plan-suggestions')
@ApiBearerAuth()
@Controller('ai/plan-suggestions')
export class PlanSuggestionsController {
	constructor(
		private readonly planSuggestionsService: PlanSuggestionsService,
	) {}

	@Post()
	@ApiOperation({
		summary: 'Ask the AI to design a program for a client',
		description:
			'Returns as soon as the request is queued. The plan itself arrives ' +
			'later — poll the suggestion or listen for the completion event. ' +
			'Everything the model needs is read from the client’s file; the ' +
			'optional fields only override what the intake already says.',
	})
	@ApiResponse({ status: 201, description: 'Generation queued' })
	@ApiResponse({
		status: 400,
		description: 'No active tenant selected, or the body is invalid',
	})
	@ApiResponse({
		status: 404,
		description: 'Active client membership not found in this tenant',
	})
	@ApiResponse({
		status: 409,
		description: 'A plan of this kind is already being generated',
	})
	@ApiResponse({
		status: 503,
		description: 'The generation request could not be queued',
	})
	create(
		@CurrentTenant() tenantId: string | null,
		@CurrentUser('userId') coachId: string,
		@Body() body: CreatePlanSuggestionDto,
	) {
		return this.planSuggestionsService.request(tenantId, coachId, body);
	}

	@Get()
	@ApiOperation({
		summary: 'List plan suggestions, newest first',
		description:
			'Summaries only — the plan itself is on `GET /:id`, because it is the ' +
			'one field large enough to make a page of twenty expensive. Filter by ' +
			'`membershipId` for one client, or by `status` for what is waiting.',
	})
	@ApiResponse({ status: 200, description: 'Suggestions retrieved' })
	@ApiResponse({ status: 400, description: 'No active tenant selected' })
	@HttpCode(HttpStatus.OK)
	findAll(
		@CurrentTenant() tenantId: string | null,
		@Query() query: QueryPlanSuggestionsDto,
	) {
		return this.planSuggestionsService.list(tenantId, query);
	}

	@Get(':id')
	@ApiOperation({
		summary: 'Get one suggestion, with the proposed plan',
		description:
			'Includes the plan, every warning, and the snapshot of the client the ' +
			'model actually reasoned about — which is the honest answer when a coach ' +
			'asks why it proposed what it did.',
	})
	@ApiResponse({ status: 200, description: 'Suggestion retrieved' })
	@ApiResponse({ status: 400, description: 'No active tenant selected' })
	@ApiResponse({ status: 404, description: 'Suggestion not found' })
	@HttpCode(HttpStatus.OK)
	findOne(
		@CurrentTenant() tenantId: string | null,
		@Param('id', ParseUUIDPipe) suggestionId: string,
	) {
		return this.planSuggestionsService.findOne(tenantId, suggestionId);
	}

	@Post(':id/accept')
	@ApiOperation({
		summary: 'Accept a suggestion and build the plan',
		description:
			'Creates the real program or nutrition plan, as a draft, and marks the ' +
			'suggestion accepted — both in one transaction. Every exercise and meal ' +
			'is re-checked against the live library first, because a coach may have ' +
			'archived one while the suggestion sat waiting.',
	})
	@ApiResponse({ status: 201, description: 'Plan created' })
	@ApiResponse({ status: 400, description: 'No active tenant selected' })
	@ApiResponse({ status: 404, description: 'Suggestion not found' })
	@ApiResponse({
		status: 409,
		description:
			'Not in a state that can be accepted, already decided, or the plan ' +
			'references library rows that no longer exist',
	})
	accept(
		@CurrentTenant() tenantId: string | null,
		@CurrentUser('userId') coachId: string,
		@Param('id', ParseUUIDPipe) suggestionId: string,
		@Body() body: AcceptPlanSuggestionDto,
	) {
		return this.planSuggestionsService.accept(
			tenantId,
			coachId,
			suggestionId,
			body,
		);
	}

	@Post(':id/decline')
	@ApiOperation({
		summary: 'Decline a suggestion',
		description:
			'Records the decision and the reason. Nothing is built, and the reason ' +
			'is the natural starting point for a regenerated request.',
	})
	@ApiResponse({ status: 200, description: 'Suggestion declined' })
	@ApiResponse({ status: 400, description: 'No active tenant selected' })
	@ApiResponse({ status: 404, description: 'Suggestion not found' })
	@ApiResponse({
		status: 409,
		description: 'Not in a state that can be declined, or already decided',
	})
	@HttpCode(HttpStatus.OK)
	decline(
		@CurrentTenant() tenantId: string | null,
		@Param('id', ParseUUIDPipe) suggestionId: string,
		@Body() body: DeclinePlanSuggestionDto,
	) {
		return this.planSuggestionsService.decline(tenantId, suggestionId, body);
	}
}
