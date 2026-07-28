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
import { CurrentTenant, CurrentUser } from '../../../auth';
import {
	CreateClientNutritionPlanDto,
	UpdateClientNutritionPlanDto,
} from '../dto/create-client-nutrition-plan.dto';
import { QueryClientNutritionPlansDto } from '../dto/query-client-nutrition-plans.dto';
import {
	AddMealFromLibraryDto,
	CreateLibraryMealAndAddDto,
	ReplacePlannedMealItemsDto,
	UpdateNutritionPlanDayDto,
	UpdatePlannedMealDto,
} from '../dto/nutrition-builder.dto';
import {
	CoachNutritionDayReviewResponseDto,
	CoachNutritionPlanLogsResponseDto,
} from '../dto/nutrition-log-review.dto';
import { RescheduleClientNutritionPlanDto } from '../dto/nutrition-plan-lifecycle.dto';
import { ClientNutritionPlansService } from '../services/client-nutrition-plans.service';
import { NutritionPlanLifecycleService } from '../services/nutrition-plan-lifecycle.service';
import { NutritionPlanDaysService } from '../services/nutrition-plan-days.service';
import { NutritionLogReviewService } from '../services/nutrition-log-review.service';
import { PlannedMealsService } from '../services/planned-meals.service';

@ApiTags('coach/client-nutrition-plans')
@ApiBearerAuth()
@Controller('plans/nutrition/client-plans')
export class ClientNutritionPlansController {
	constructor(
		private readonly clientNutritionPlansService: ClientNutritionPlansService,
		private readonly nutritionPlanLifecycleService: NutritionPlanLifecycleService,
		private readonly nutritionPlanDaysService: NutritionPlanDaysService,
		private readonly plannedMealsService: PlannedMealsService,
		private readonly nutritionLogReviewService: NutritionLogReviewService,
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

	@Get(':planId/logs')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Review all nutrition logs for one tenant client plan',
	})
	@ApiResponse({
		status: 200,
		description: 'Nutrition plan logs retrieved',
		type: CoachNutritionPlanLogsResponseDto,
	})
	@ApiResponse({
		status: 404,
		description: 'Client nutrition plan not found in the active tenant',
	})
	listPlanLogs(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
	) {
		return this.nutritionLogReviewService.listPlanLogs(tenantId, planId);
	}

	@Get(':planId/days/:dayId/log')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			'Review one nutrition prescription beside reported and actual intake',
	})
	@ApiResponse({
		status: 200,
		description: 'Nutrition plan day review retrieved',
		type: CoachNutritionDayReviewResponseDto,
	})
	@ApiResponse({
		status: 404,
		description:
			'Client nutrition plan day not found under this plan and active tenant',
	})
	getPlanDayLog(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
		@Param('dayId', ParseUUIDPipe) dayId: string,
	) {
		return this.nutritionLogReviewService.getPlanDayLog(
			tenantId,
			planId,
			dayId,
		);
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

	@Post(':planId/publish')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Publish a complete client nutrition-plan draft' })
	@ApiResponse({ status: 200, description: 'Client nutrition plan published' })
	@ApiResponse({ status: 400, description: 'Plan is incomplete' })
	@ApiResponse({ status: 409, description: 'Lifecycle or overlap conflict' })
	publishClientPlan(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
	) {
		return this.nutritionPlanLifecycleService.publishClientPlan(
			tenantId,
			planId,
		);
	}

	@Post(':planId/reschedule')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Reschedule a scheduled published nutrition plan',
		description:
			'Only a currently scheduled plan can be rescheduled. The new startDate may be today in the tenant timezone; when today is selected, the plan becomes active immediately and cannot be rescheduled again because active plans are immutable to rescheduling.',
	})
	@ApiResponse({
		status: 200,
		description:
			'Client nutrition plan rescheduled; selecting today makes its schedule phase active immediately',
	})
	@ApiResponse({
		status: 409,
		description:
			'Plan is not currently scheduled, or the requested dates overlap another published plan',
	})
	rescheduleClientPlan(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
		@Body() body: RescheduleClientNutritionPlanDto,
	) {
		return this.nutritionPlanLifecycleService.rescheduleClientPlan(
			tenantId,
			planId,
			body,
		);
	}

	@Post(':planId/cancel')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Cancel a scheduled or active published nutrition plan',
		description:
			'Drafts should be archived instead of cancelled. Ended plans are historical and cannot be cancelled.',
	})
	@ApiResponse({ status: 200, description: 'Client nutrition plan cancelled' })
	@ApiResponse({
		status: 409,
		description: 'Plan is a draft, already cancelled, or has already ended',
	})
	cancelClientPlan(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
	) {
		return this.nutritionPlanLifecycleService.cancelClientPlan(
			tenantId,
			planId,
		);
	}

	@Post(':planId/unarchive')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Restore an archived client nutrition plan to coach lists',
	})
	@ApiResponse({ status: 200, description: 'Client nutrition plan unarchived' })
	@ApiResponse({ status: 404, description: 'Client nutrition plan not found' })
	unarchiveClientPlan(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
	) {
		return this.nutritionPlanLifecycleService.unarchiveClientPlan(
			tenantId,
			planId,
		);
	}

	@Delete(':planId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Archive a client nutrition plan from coach lists' })
	@ApiResponse({ status: 200, description: 'Client nutrition plan archived' })
	archiveClientPlan(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
	) {
		return this.nutritionPlanLifecycleService.archiveClientPlan(
			tenantId,
			planId,
		);
	}

	@Patch(':planId/days/:dayId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Update a nutrition day, target overrides, or flexible status',
	})
	@ApiResponse({ status: 200, description: 'Nutrition plan day updated' })
	@ApiResponse({ status: 404, description: 'Editable plan day not found' })
	@ApiResponse({ status: 409, description: 'Flexible-day conflict' })
	updatePlanDay(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
		@Param('dayId', ParseUUIDPipe) dayId: string,
		@Body() body: UpdateNutritionPlanDayDto,
	) {
		return this.nutritionPlanDaysService.updatePlanDay(
			tenantId,
			planId,
			dayId,
			body,
		);
	}

	@Post(':planId/days/:dayId/meals/from-library')
	@ApiOperation({ summary: 'Snapshot a reusable Meal into a nutrition day' })
	@ApiResponse({ status: 201, description: 'Planned Meal added' })
	@ApiResponse({
		status: 404,
		description: 'Plan day or active Meal not found',
	})
	@ApiResponse({ status: 409, description: 'Flexible-day conflict' })
	addMealFromLibrary(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
		@Param('dayId', ParseUUIDPipe) dayId: string,
		@Body() body: AddMealFromLibraryDto,
	) {
		return this.plannedMealsService.addMealFromLibrary(
			tenantId,
			planId,
			dayId,
			body,
		);
	}

	@Post(':planId/days/:dayId/meals/create-in-library')
	@ApiOperation({
		summary: 'Create a reusable Meal and snapshot it into a nutrition day',
	})
	@ApiResponse({ status: 201, description: 'Meal created and planned' })
	@ApiResponse({ status: 404, description: 'Plan day or Food not found' })
	@ApiResponse({ status: 409, description: 'Flexible-day or name conflict' })
	createLibraryMealAndAdd(
		@CurrentTenant() tenantId: string | null,
		@CurrentUser('userId') coachId: string,
		@Param('planId', ParseUUIDPipe) planId: string,
		@Param('dayId', ParseUUIDPipe) dayId: string,
		@Body() body: CreateLibraryMealAndAddDto,
	) {
		return this.plannedMealsService.createLibraryMealAndAdd(
			tenantId,
			coachId,
			planId,
			dayId,
			body,
		);
	}

	@Patch(':planId/meals/:plannedMealId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Edit or reorder a planned Meal' })
	@ApiResponse({ status: 200, description: 'Planned Meal updated' })
	@ApiResponse({ status: 404, description: 'Planned Meal not found' })
	updatePlannedMeal(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
		@Param('plannedMealId', ParseUUIDPipe) plannedMealId: string,
		@Body() body: UpdatePlannedMealDto,
	) {
		return this.plannedMealsService.updatePlannedMeal(
			tenantId,
			planId,
			plannedMealId,
			body,
		);
	}

	@Put(':planId/meals/:plannedMealId/items')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Replace the amounts and order of planned Meal Foods',
	})
	@ApiResponse({ status: 200, description: 'Planned Meal Foods replaced' })
	@ApiResponse({ status: 404, description: 'Planned Meal not found' })
	replacePlannedMealItems(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
		@Param('plannedMealId', ParseUUIDPipe) plannedMealId: string,
		@Body() body: ReplacePlannedMealItemsDto,
	) {
		return this.plannedMealsService.replacePlannedMealItems(
			tenantId,
			planId,
			plannedMealId,
			body,
		);
	}

	@Delete(':planId/meals/:plannedMealId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Delete a planned Meal and compact day positions' })
	@ApiResponse({ status: 200, description: 'Planned Meal deleted' })
	@ApiResponse({ status: 404, description: 'Planned Meal not found' })
	deletePlannedMeal(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
		@Param('plannedMealId', ParseUUIDPipe) plannedMealId: string,
	) {
		return this.plannedMealsService.deletePlannedMeal(
			tenantId,
			planId,
			plannedMealId,
		);
	}
}
