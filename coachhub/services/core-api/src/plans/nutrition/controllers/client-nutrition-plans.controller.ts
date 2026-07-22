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
import { ClientNutritionPlansService } from '../services/client-nutrition-plans.service';
import { NutritionPlanDaysService } from '../services/nutrition-plan-days.service';
import { PlannedMealsService } from '../services/planned-meals.service';

@ApiTags('coach/client-nutrition-plans')
@ApiBearerAuth()
@Controller('plans/nutrition/client-plans')
export class ClientNutritionPlansController {
	constructor(
		private readonly clientNutritionPlansService: ClientNutritionPlansService,
		private readonly nutritionPlanDaysService: NutritionPlanDaysService,
		private readonly plannedMealsService: PlannedMealsService,
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
