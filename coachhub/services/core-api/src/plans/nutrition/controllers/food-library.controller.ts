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
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant, CurrentUser } from '../../../auth';
import { CreateFoodDto } from '../dto/create-food.dto';
import { QueryFoodsDto } from '../dto/query-foods.dto';
import { UpdateFoodDto } from '../dto/update-food.dto';
import { FoodLibraryService } from '../services/food-library.service';

@ApiTags('coach/nutrition-food-library')
@ApiBearerAuth()
@Controller('nutrition/library/foods')
export class FoodLibraryController {
	constructor(private readonly foodLibraryService: FoodLibraryService) {}

	@Post()
	@ApiOperation({ summary: 'Create a Food in the active tenant library' })
	@ApiResponse({ status: 201, description: 'Food created' })
	@ApiResponse({ status: 409, description: 'Food name and brand conflict' })
	createFood(
		@CurrentTenant() tenantId: string | null,
		@CurrentUser('userId') coachId: string,
		@Body() body: CreateFoodDto,
	) {
		return this.foodLibraryService.createFood(tenantId, coachId, body);
	}

	@Get()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'List Foods in the active tenant library' })
	@ApiResponse({ status: 200, description: 'Foods retrieved' })
	findFoods(
		@CurrentTenant() tenantId: string | null,
		@Query() query: QueryFoodsDto,
	) {
		return this.foodLibraryService.findFoods(tenantId, query);
	}

	@Get(':foodId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get one Food from the active tenant library' })
	@ApiResponse({ status: 200, description: 'Food retrieved' })
	@ApiResponse({ status: 404, description: 'Food not found' })
	findFood(
		@CurrentTenant() tenantId: string | null,
		@Param('foodId', ParseUUIDPipe) foodId: string,
	) {
		return this.foodLibraryService.findFood(tenantId, foodId);
	}

	@Patch(':foodId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Update or restore a tenant library Food' })
	@ApiResponse({ status: 200, description: 'Food updated' })
	@ApiResponse({ status: 404, description: 'Food not found' })
	@ApiResponse({ status: 409, description: 'Food name and brand conflict' })
	updateFood(
		@CurrentTenant() tenantId: string | null,
		@Param('foodId', ParseUUIDPipe) foodId: string,
		@Body() body: UpdateFoodDto,
	) {
		return this.foodLibraryService.updateFood(tenantId, foodId, body);
	}

	@Delete(':foodId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Archive a tenant library Food' })
	@ApiResponse({ status: 200, description: 'Food archived' })
	@ApiResponse({ status: 404, description: 'Food not found' })
	archiveFood(
		@CurrentTenant() tenantId: string | null,
		@Param('foodId', ParseUUIDPipe) foodId: string,
	) {
		return this.foodLibraryService.archiveFood(tenantId, foodId);
	}
}
