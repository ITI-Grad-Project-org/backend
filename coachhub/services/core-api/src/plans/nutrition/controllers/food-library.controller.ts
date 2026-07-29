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
	CoachFoodResponseDto,
	NutritionActionMessageResponseDto,
} from '../dto/coach-nutrition-response.dto';
import { CreateFoodDto } from '../dto/create-food.dto';
import { QueryFoodsDto } from '../dto/query-foods.dto';
import { UpdateFoodDto } from '../dto/update-food.dto';
import { FoodLibraryService } from '../services/food-library.service';

@ApiTags('Coach - Nutrition Food Library')
@ApiBearerAuth()
@Controller('nutrition/library/foods')
export class FoodLibraryController {
	constructor(private readonly foodLibraryService: FoodLibraryService) {}

	@Post()
	@ApiOperation({
		summary: 'Create a Food in the active tenant library',
		description:
			'Creates a reusable Food for the coach tenant. Nutrients are stored per serving. The Food can then be used in reusable Meals, planned Meals, and client food logs.',
	})
	@ApiCreatedResponse({
		description: 'The Food was created and is active.',
		type: CoachFoodResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'The body is invalid or contains unrealistic nutrient values.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description:
			'An active or archived Food with the same normalized name and brand already exists.',
		type: ClientNutritionApiErrorResponseDto,
	})
	createFood(
		@CurrentTenant() tenantId: string | null,
		@CurrentUser('userId') coachId: string,
		@Body() body: CreateFoodDto,
	) {
		return this.foodLibraryService.createFood(tenantId, coachId, body);
	}

	@Get()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'List Foods in the active tenant library',
		description:
			'Returns tenant Foods in stable name order. Search and nutrition filters come from the query string. Archived Foods are excluded unless includeInactive is true.',
	})
	@ApiOkResponse({
		description: 'Matching Foods were retrieved.',
		type: CoachFoodResponseDto,
		isArray: true,
	})
	@ApiBadRequestResponse({
		description: 'One or more query values are invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
	findFoods(
		@CurrentTenant() tenantId: string | null,
		@Query() query: QueryFoodsDto,
	) {
		return this.foodLibraryService.findFoods(tenantId, query);
	}

	@Get(':foodId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Get one Food from the active tenant library',
		description:
			'Returns one active or archived Food when it belongs to the coach tenant.',
	})
	@ApiOkResponse({
		description: 'The Food was retrieved.',
		type: CoachFoodResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'foodId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The Food does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	findFood(
		@CurrentTenant() tenantId: string | null,
		@Param('foodId', ParseUUIDPipe) foodId: string,
	) {
		return this.foodLibraryService.findFood(tenantId, foodId);
	}

	@Patch(':foodId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Update or restore a tenant library Food',
		description:
			'Updates only the supplied Food fields. Set isActive to true to restore an archived Food. Existing Meal and plan snapshots keep their stored prescription values.',
	})
	@ApiOkResponse({
		description: 'The updated Food was returned.',
		type: CoachFoodResponseDto,
	})
	@ApiBadRequestResponse({
		description:
			'foodId, the request body, or the resulting complete nutrient definition is invalid.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The Food does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description:
			'Another Food with the resulting normalized name and brand already exists.',
		type: ClientNutritionApiErrorResponseDto,
	})
	updateFood(
		@CurrentTenant() tenantId: string | null,
		@Param('foodId', ParseUUIDPipe) foodId: string,
		@Body() body: UpdateFoodDto,
	) {
		return this.foodLibraryService.updateFood(tenantId, foodId, body);
	}

	@Delete(':foodId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Archive a tenant library Food',
		description:
			'Marks the Food inactive. It remains available for historical data but is excluded from normal library choices.',
	})
	@ApiOkResponse({
		description: 'The Food was archived.',
		type: NutritionActionMessageResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'foodId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'The Food does not exist in the active tenant.',
		type: ClientNutritionApiErrorResponseDto,
	})
	archiveFood(
		@CurrentTenant() tenantId: string | null,
		@Param('foodId', ParseUUIDPipe) foodId: string,
	) {
		return this.foodLibraryService.archiveFood(tenantId, foodId);
	}
}
