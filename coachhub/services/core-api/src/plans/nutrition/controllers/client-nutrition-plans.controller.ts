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
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant, CurrentUser } from '../../../auth';
import {
	ClientNutritionApiErrorResponseDto,
	ClientPlannedMealResponseDto,
} from '../dto/client-nutrition-response.dto';
import {
	CoachNutritionDayResponseDto,
	CoachNutritionPlanBuilderResponseDto,
	CoachNutritionPlanSummaryResponseDto,
	CreateLibraryMealAndAddResponseDto,
	NutritionActionMessageResponseDto,
	PublishClientNutritionPlanResponseDto,
} from '../dto/coach-nutrition-response.dto';
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
import { RescheduleClientNutritionPlanDto } from '../dto/nutrition-plan-lifecycle.dto';
import { ClientNutritionPlansService } from '../services/client-nutrition-plans.service';
import { NutritionPlanLifecycleService } from '../services/nutrition-plan-lifecycle.service';
import { NutritionPlanDaysService } from '../services/nutrition-plan-days.service';
import { PlannedMealsService } from '../services/planned-meals.service';

@ApiTags('Coach - Client Nutrition Plans')
@ApiBearerAuth()
@Controller('plans/nutrition/client-plans')
export class ClientNutritionPlansController {
	constructor(
		private readonly clientNutritionPlansService: ClientNutritionPlansService,
		private readonly nutritionPlanLifecycleService: NutritionPlanLifecycleService,
		private readonly nutritionPlanDaysService: NutritionPlanDaysService,
		private readonly plannedMealsService: PlannedMealsService,
	) {}

	@Post()
	@ApiOperation({
		summary: 'Create a dated client nutrition-plan draft',
		description:
			'Creates the draft and its complete dated week/day structure for an active client membership in the coach tenant. The plan is not visible to the client until it is published.',
	})
	@ApiCreatedResponse({
		description: 'The draft and its generated builder tree were created.',
		type: CoachNutritionPlanBuilderResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'The body, start date, duration, or targets are invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'Active same-tenant client membership not found',
		type: ClientNutritionApiErrorResponseDto,
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
	@ApiOperation({
		summary: 'List client nutrition plans in my tenant',
		description:
			'Returns coach-facing plan summaries filtered by membership, lifecycle status, and archive state. It does not return the large week/day builder tree.',
	})
	@ApiOkResponse({
		description: 'Matching client nutrition-plan summaries were retrieved.',
		type: CoachNutritionPlanSummaryResponseDto,
		isArray: true,
	})
	@ApiBadRequestResponse({
		description: 'One or more query values are invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
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
		description:
			'Returns the full coach builder: plan targets, client dietary profile, warnings, weeks, dated days, planned Meals, planned Foods, totals, and target variance.',
	})
	@ApiOkResponse({
		description: 'The complete client nutrition-plan builder was retrieved.',
		type: CoachNutritionPlanBuilderResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'planId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The plan does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
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
		description:
			'Updates only supplied fields on a draft. Changing startDate or durationWeeks rebuilds the dated structure while preserving days that still fit where the service permits it.',
	})
	@ApiOkResponse({
		description: 'The updated complete builder tree was returned.',
		type: CoachNutritionPlanBuilderResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'planId or the update body is invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The plan does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description: 'The plan is no longer an editable draft.',
		type: ClientNutritionApiErrorResponseDto,
	})
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
	@ApiOperation({
		summary: 'Publish a complete client nutrition-plan draft',
		description:
			'Validates the full structure, required daily targets, planned Meals, and Foods, then makes the plan available on the client schedule. Target variance is advisory and is returned as warnings; incomplete structure blocks publishing.',
	})
	@ApiOkResponse({
		description:
			'The published builder tree and any non-blocking target-variance warnings were returned.',
		type: PublishClientNutritionPlanResponseDto,
	})
	@ApiBadRequestResponse({
		description:
			'planId is invalid or the draft has missing targets, missing Meals, or empty Meals.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The plan does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description:
			'The lifecycle state is invalid or the plan overlaps another published nutrition plan for this membership.',
		type: ClientNutritionApiErrorResponseDto,
	})
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
	@ApiOkResponse({
		description:
			'Client nutrition plan rescheduled; selecting today makes its schedule phase active immediately',
		type: CoachNutritionPlanBuilderResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'planId or the new startDate is invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The plan does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description:
			'Plan is not currently scheduled, or the requested dates overlap another published plan',
		type: ClientNutritionApiErrorResponseDto,
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
	@ApiOkResponse({
		description: 'The cancelled complete plan builder was returned.',
		type: CoachNutritionPlanBuilderResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'planId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The plan does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description: 'Plan is a draft, already cancelled, or has already ended',
		type: ClientNutritionApiErrorResponseDto,
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
		description:
			'Clears the coach-only archive flag. It does not change the plan lifecycle status or make a draft visible to the client.',
	})
	@ApiOkResponse({
		description: 'The plan was restored to normal coach list results.',
		type: NutritionActionMessageResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'planId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The plan does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
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
	@ApiOperation({
		summary: 'Archive a client nutrition plan from coach lists',
		description:
			'Sets the coach-only archive flag and hides the plan from normal coach list results. Historical data is preserved, and this action does not replace lifecycle cancellation.',
	})
	@ApiOkResponse({
		description: 'The plan was hidden from normal coach list results.',
		type: NutritionActionMessageResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'planId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The plan does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
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
		description:
			'Updates notes, flexible-day state, or daily target overrides on an editable draft day. A null override means use the plan-level target. Making a day flexible removes its planned Meals.',
	})
	@ApiOkResponse({
		description:
			'The updated day was returned with effective targets, totals, variance, warnings, and planned Meals.',
		type: CoachNutritionDayResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'planId, dayId, or the update body is invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description:
			'The draft plan day does not exist under this plan and active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description:
			'The operation conflicts with the plan lifecycle or flexible-day rules.',
		type: ClientNutritionApiErrorResponseDto,
	})
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
	@ApiOperation({
		summary: 'Snapshot a reusable Meal into a nutrition day',
		description:
			'Copies an active reusable Meal and its current Food values into an editable draft day. Later library edits do not silently change this prescription snapshot.',
	})
	@ApiCreatedResponse({
		description: 'The new planned Meal snapshot was returned.',
		type: ClientPlannedMealResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'A path identifier, position, slot, or suggested time is invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'Plan day or active Meal not found',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description:
			'The plan is not editable or the target day is a flexible day.',
		type: ClientNutritionApiErrorResponseDto,
	})
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
		description:
			'Creates a new tenant Meal from active Foods and immediately copies it into the selected editable draft day. The response returns both the reusable Meal and the independent planned snapshot.',
	})
	@ApiCreatedResponse({
		description: 'The reusable Meal and planned Meal snapshot were returned.',
		type: CreateLibraryMealAndAddResponseDto,
	})
	@ApiBadRequestResponse({
		description:
			'A path identifier, Meal definition, ingredient amount, position, or slot is invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The draft day or at least one active Food was not found.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description:
			'The day is flexible, the plan is not editable, or the Meal name already exists.',
		type: ClientNutritionApiErrorResponseDto,
	})
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
	@ApiOperation({
		summary: 'Edit or reorder a planned Meal',
		description:
			'Updates supplied prescription metadata such as slot, position, suggested time, and coach notes. It does not edit the reusable library Meal.',
	})
	@ApiOkResponse({
		description: 'The updated planned Meal snapshot was returned.',
		type: ClientPlannedMealResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'A path identifier or update value is invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description:
			'The planned Meal does not exist under this plan and active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description: 'The plan is not an editable draft.',
		type: ClientNutritionApiErrorResponseDto,
	})
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
		description:
			'Replaces the complete planned-Food list using Foods already captured in this planned Meal snapshot. The supplied array defines the new order and amounts, and totals are recalculated.',
	})
	@ApiOkResponse({
		description: 'The planned Meal was returned with replaced Foods and totals.',
		type: ClientPlannedMealResponseDto,
	})
	@ApiBadRequestResponse({
		description:
			'A path identifier, Food identifier, amount, or item list is invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description:
			'The planned Meal or a referenced planned Food was not found under this plan.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description: 'The plan is not an editable draft.',
		type: ClientNutritionApiErrorResponseDto,
	})
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
	@ApiOperation({
		summary: 'Delete a planned Meal and compact day positions',
		description:
			'Deletes the prescription snapshot from an editable draft day and closes position gaps for the remaining planned Meals. The reusable library Meal is not deleted.',
	})
	@ApiOkResponse({
		description: 'The planned Meal was deleted.',
		type: NutritionActionMessageResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'planId or plannedMealId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description:
			'The planned Meal does not exist under this plan and active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description: 'The plan is not an editable draft.',
		type: ClientNutritionApiErrorResponseDto,
	})
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
