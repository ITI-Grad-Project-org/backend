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
import { ClientNutritionApiErrorResponseDto } from '../dto/client-nutrition-response.dto';
import {
	CoachMealResponseDto,
	NutritionActionMessageResponseDto,
} from '../dto/coach-nutrition-response.dto';
import { CreateMealDto } from '../dto/create-meal.dto';
import { QueryMealsDto } from '../dto/query-meals.dto';
import { ReplaceMealItemsDto } from '../dto/replace-meal-items.dto';
import { UpdateMealDto } from '../dto/update-meal.dto';
import { MealLibraryService } from '../services/meal-library.service';

@ApiTags('Coach - Nutrition Meal Library')
@ApiBearerAuth()
@Controller('nutrition/library/meals')
export class MealLibraryController {
	constructor(private readonly mealLibraryService: MealLibraryService) {}

	@Post()
	@ApiOperation({
		summary: 'Create a reusable Meal from active tenant Foods',
		description:
			'Creates a reusable recipe. Each item references one active tenant Food and gives its amount. The response includes ordered ingredients, calculated nutrients for each item, and calculated Meal totals.',
	})
	@ApiCreatedResponse({
		description: 'The reusable Meal was created and is active.',
		type: CoachMealResponseDto,
	})
	@ApiBadRequestResponse({
		description:
			'The body is invalid, an amount is unrealistic, or the same Food appears more than once.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'At least one requested active Food was not found.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description: 'A Meal with the same normalized name already exists.',
		type: ClientNutritionApiErrorResponseDto,
	})
	createMeal(
		@CurrentTenant() tenantId: string | null,
		@CurrentUser('userId') coachId: string,
		@Body() body: CreateMealDto,
	) {
		return this.mealLibraryService.createMeal(tenantId, coachId, body);
	}

	@Get()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'List tenant Meals with complete recipes and calculated totals',
		description:
			'Returns reusable tenant Meals in stable name order. Every result contains its full ordered recipe and calculated totals. Archived Meals are excluded unless includeInactive is true.',
	})
	@ApiOkResponse({
		description: 'Matching reusable Meals were retrieved.',
		type: CoachMealResponseDto,
		isArray: true,
	})
	@ApiBadRequestResponse({
		description: 'One or more query values are invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
	findMeals(
		@CurrentTenant() tenantId: string | null,
		@Query() query: QueryMealsDto,
	) {
		return this.mealLibraryService.findMeals(tenantId, query);
	}

	@Get(':mealId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Get one reusable tenant Meal',
		description:
			'Returns one active or archived Meal with its ordered ingredients, ingredient nutrients, effective allergens, and total nutrients.',
	})
	@ApiOkResponse({
		description: 'The reusable Meal was retrieved.',
		type: CoachMealResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'mealId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The Meal does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	findMeal(
		@CurrentTenant() tenantId: string | null,
		@Param('mealId', ParseUUIDPipe) mealId: string,
	) {
		return this.mealLibraryService.findMeal(tenantId, mealId);
	}

	@Patch(':mealId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Update or restore reusable Meal metadata',
		description:
			'Updates only the supplied Meal metadata. It does not change recipe items; use the items endpoint for that. Set isActive to true to restore an archived Meal.',
	})
	@ApiOkResponse({
		description: 'The updated Meal was returned with its complete recipe.',
		type: CoachMealResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'mealId or the request body is invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The Meal does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description: 'Another Meal with the resulting normalized name exists.',
		type: ClientNutritionApiErrorResponseDto,
	})
	updateMeal(
		@CurrentTenant() tenantId: string | null,
		@Param('mealId', ParseUUIDPipe) mealId: string,
		@Body() body: UpdateMealDto,
	) {
		return this.mealLibraryService.updateMeal(tenantId, mealId, body);
	}

	@Put(':mealId/items')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Transactionally replace the complete ordered Meal recipe',
		description:
			'Replaces every ingredient in one transaction. The supplied items become the full recipe, in array order. The response contains recalculated ingredient nutrients, effective allergens, and totals.',
	})
	@ApiOkResponse({
		description: 'The complete recipe was replaced and recalculated.',
		type: CoachMealResponseDto,
	})
	@ApiBadRequestResponse({
		description:
			'mealId, an amount, or the item list is invalid, or a Food is duplicated.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The Meal or at least one requested active Food was not found.',
		type: ClientNutritionApiErrorResponseDto,
	})
	replaceMealItems(
		@CurrentTenant() tenantId: string | null,
		@Param('mealId', ParseUUIDPipe) mealId: string,
		@Body() body: ReplaceMealItemsDto,
	) {
		return this.mealLibraryService.replaceMealItems(tenantId, mealId, body);
	}

	@Delete(':mealId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Archive a reusable tenant Meal',
		description:
			'Marks the Meal inactive. Existing nutrition-plan snapshots remain unchanged, while the Meal is removed from normal library choices.',
	})
	@ApiOkResponse({
		description: 'The reusable Meal was archived.',
		type: NutritionActionMessageResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'mealId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The Meal does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	archiveMeal(
		@CurrentTenant() tenantId: string | null,
		@Param('mealId', ParseUUIDPipe) mealId: string,
	) {
		return this.mealLibraryService.archiveMeal(tenantId, mealId);
	}
}
