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
import { CreateMealDto } from '../dto/create-meal.dto';
import { QueryMealsDto } from '../dto/query-meals.dto';
import { ReplaceMealItemsDto } from '../dto/replace-meal-items.dto';
import { UpdateMealDto } from '../dto/update-meal.dto';
import { MealLibraryService } from '../services/meal-library.service';

@ApiTags('coach/nutrition-meal-library')
@ApiBearerAuth()
@Controller('nutrition/library/meals')
export class MealLibraryController {
	constructor(private readonly mealLibraryService: MealLibraryService) {}

	@Post()
	@ApiOperation({ summary: 'Create a reusable Meal from active tenant Foods' })
	@ApiResponse({ status: 201, description: 'Meal created' })
	@ApiResponse({ status: 404, description: 'Active library Food not found' })
	@ApiResponse({ status: 409, description: 'Meal name conflict' })
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
	})
	@ApiResponse({ status: 200, description: 'Meals retrieved' })
	findMeals(
		@CurrentTenant() tenantId: string | null,
		@Query() query: QueryMealsDto,
	) {
		return this.mealLibraryService.findMeals(tenantId, query);
	}

	@Get(':mealId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get one reusable tenant Meal' })
	@ApiResponse({ status: 200, description: 'Meal retrieved' })
	@ApiResponse({ status: 404, description: 'Meal not found' })
	findMeal(
		@CurrentTenant() tenantId: string | null,
		@Param('mealId', ParseUUIDPipe) mealId: string,
	) {
		return this.mealLibraryService.findMeal(tenantId, mealId);
	}

	@Patch(':mealId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Update or restore reusable Meal metadata' })
	@ApiResponse({ status: 200, description: 'Meal updated' })
	@ApiResponse({ status: 404, description: 'Meal not found' })
	@ApiResponse({ status: 409, description: 'Meal name conflict' })
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
	})
	@ApiResponse({ status: 200, description: 'Meal ingredients replaced' })
	@ApiResponse({ status: 404, description: 'Meal or active Food not found' })
	replaceMealItems(
		@CurrentTenant() tenantId: string | null,
		@Param('mealId', ParseUUIDPipe) mealId: string,
		@Body() body: ReplaceMealItemsDto,
	) {
		return this.mealLibraryService.replaceMealItems(tenantId, mealId, body);
	}

	@Delete(':mealId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Archive a reusable tenant Meal' })
	@ApiResponse({ status: 200, description: 'Meal archived' })
	@ApiResponse({ status: 404, description: 'Meal not found' })
	archiveMeal(
		@CurrentTenant() tenantId: string | null,
		@Param('mealId', ParseUUIDPipe) mealId: string,
	) {
		return this.mealLibraryService.archiveMeal(tenantId, mealId);
	}
}
