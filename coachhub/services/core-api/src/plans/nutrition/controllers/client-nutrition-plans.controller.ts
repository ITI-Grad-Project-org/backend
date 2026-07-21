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
import { CurrentTenant, CurrentUser } from '../../../auth';
import {
	CreateClientNutritionPlanDto,
	UpdateClientNutritionPlanDto,
} from '../dto/create-client-nutrition-plan.dto';
import { QueryClientNutritionPlansDto } from '../dto/query-client-nutrition-plans.dto';
import { ClientNutritionPlansService } from '../services/client-nutrition-plans.service';

@ApiTags('coach/client-nutrition-plans')
@ApiBearerAuth()
@Controller('plans/nutrition/client-plans')
export class ClientNutritionPlansController {
	constructor(
		private readonly clientNutritionPlansService: ClientNutritionPlansService,
	) {}

	@Post()
	@ApiOperation({ summary: 'Create a dated client nutrition-plan draft' })
	@ApiResponse({ status: 201, description: 'Client nutrition plan created' })
	@ApiResponse({
		status: 404,
		description: 'Active same-tenant client membership not found',
	})
	createClientPlan(
		@CurrentTenant() tenantId: string | null,
		@CurrentUser('userId') coachId: string,
		@Body() body: CreateClientNutritionPlanDto,
	) {
		return this.clientNutritionPlansService.createClientPlan(
			tenantId,
			coachId,
			body,
		);
	}

	@Get()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'List client nutrition plans in my tenant' })
	@ApiResponse({ status: 200, description: 'Client nutrition plans retrieved' })
	findClientPlans(
		@CurrentTenant() tenantId: string | null,
		@Query() query: QueryClientNutritionPlansDto,
	) {
		return this.clientNutritionPlansService.findClientPlans(tenantId, query);
	}

	@Get(':planId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Get the ordered dated client nutrition-plan builder tree',
	})
	@ApiResponse({ status: 200, description: 'Client nutrition plan retrieved' })
	@ApiResponse({ status: 404, description: 'Client nutrition plan not found' })
	getClientPlan(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
	) {
		return this.clientNutritionPlansService.getClientPlan(tenantId, planId);
	}

	@Patch(':planId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Update client nutrition-plan draft metadata, date, or targets',
	})
	@ApiResponse({ status: 200, description: 'Client nutrition plan updated' })
	@ApiResponse({ status: 404, description: 'Client nutrition plan not found' })
	@ApiResponse({ status: 409, description: 'Plan is no longer a draft' })
	updateClientPlan(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
		@Body() body: UpdateClientNutritionPlanDto,
	) {
		return this.clientNutritionPlansService.updateClientPlan(
			tenantId,
			planId,
			body,
		);
	}
}
