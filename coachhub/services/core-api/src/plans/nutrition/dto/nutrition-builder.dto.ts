import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsEnum,
	IsInt,
	IsNumber,
	IsOptional,
	IsPositive,
	IsString,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { MealSlot } from '../../../common';
import { CreateMealDto } from './create-meal.dto';
import {
	MAX_MEAL_FOOD_AMOUNT,
	MAX_MEAL_ITEMS,
	MAX_PLANNED_MEALS_PER_DAY,
	NUTRITION_TARGET_LIMITS,
} from '../utils/nutrition-validation.utils';

export class UpdateNutritionPlanDayDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	isFlexibleDay?: boolean;

	@ApiPropertyOptional({ nullable: true, maxLength: 5000 })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	notes?: string | null;

	@ApiPropertyOptional({
		nullable: true,
		minimum: NUTRITION_TARGET_LIMITS.calories.min,
		maximum: NUTRITION_TARGET_LIMITS.calories.max,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(NUTRITION_TARGET_LIMITS.calories.min)
	@Max(NUTRITION_TARGET_LIMITS.calories.max)
	targetCaloriesOverride?: number | null;

	@ApiPropertyOptional({
		nullable: true,
		minimum: NUTRITION_TARGET_LIMITS.proteinG.min,
		maximum: NUTRITION_TARGET_LIMITS.proteinG.max,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(NUTRITION_TARGET_LIMITS.proteinG.min)
	@Max(NUTRITION_TARGET_LIMITS.proteinG.max)
	targetProteinGOverride?: number | null;

	@ApiPropertyOptional({
		nullable: true,
		minimum: NUTRITION_TARGET_LIMITS.carbsG.min,
		maximum: NUTRITION_TARGET_LIMITS.carbsG.max,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(NUTRITION_TARGET_LIMITS.carbsG.min)
	@Max(NUTRITION_TARGET_LIMITS.carbsG.max)
	targetCarbsGOverride?: number | null;

	@ApiPropertyOptional({
		nullable: true,
		minimum: NUTRITION_TARGET_LIMITS.fatG.min,
		maximum: NUTRITION_TARGET_LIMITS.fatG.max,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(NUTRITION_TARGET_LIMITS.fatG.min)
	@Max(NUTRITION_TARGET_LIMITS.fatG.max)
	targetFatGOverride?: number | null;

	@ApiPropertyOptional({
		nullable: true,
		minimum: NUTRITION_TARGET_LIMITS.fiberG.min,
		maximum: NUTRITION_TARGET_LIMITS.fiberG.max,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(NUTRITION_TARGET_LIMITS.fiberG.min)
	@Max(NUTRITION_TARGET_LIMITS.fiberG.max)
	targetFiberGOverride?: number | null;

	@ApiPropertyOptional({
		nullable: true,
		minimum: NUTRITION_TARGET_LIMITS.waterMl.min,
		maximum: NUTRITION_TARGET_LIMITS.waterMl.max,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(NUTRITION_TARGET_LIMITS.waterMl.min)
	@Max(NUTRITION_TARGET_LIMITS.waterMl.max)
	targetWaterMlOverride?: number | null;
}

export class PlannedMealItemOverrideDto {
	@ApiProperty({
		format: 'uuid',
		description: 'Source reusable Meal ingredient id',
	})
	@IsUUID()
	mealIngredientId: string;

	@ApiProperty({
		example: 175,
		minimum: 0,
		maximum: MAX_MEAL_FOOD_AMOUNT,
		description:
			"Real amount in the Food's snapshotted unit; zero omits the ingredient",
	})
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(MAX_MEAL_FOOD_AMOUNT)
	amount: number;
}

export class AddMealFromLibraryDto {
	@ApiProperty({ format: 'uuid', description: 'Active tenant Meal id' })
	@IsUUID()
	mealId: string;

	@ApiProperty({ enum: MealSlot })
	@IsEnum(MealSlot)
	slot: MealSlot;

	@ApiPropertyOptional({
		minimum: 1,
		maximum: MAX_PLANNED_MEALS_PER_DAY,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(MAX_PLANNED_MEALS_PER_DAY)
	position?: number;

	@ApiPropertyOptional({ nullable: true, example: '08:30' })
	@IsOptional()
	@Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/, {
		message: 'suggestedTime must use HH:mm 24-hour format',
	})
	suggestedTime?: string | null;

	@ApiPropertyOptional({ nullable: true, maxLength: 5000 })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	coachNotes?: string | null;

	@ApiPropertyOptional({
		type: [PlannedMealItemOverrideDto],
		maxItems: MAX_MEAL_ITEMS,
		description:
			'Optional real-amount replacements keyed by source Meal ingredient id',
	})
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(MAX_MEAL_ITEMS)
	@ValidateNested({ each: true })
	@Type(() => PlannedMealItemOverrideDto)
	itemOverrides?: PlannedMealItemOverrideDto[];
}

export class InlineMealItemOverrideDto {
	@ApiProperty({
		format: 'uuid',
		description: 'Food id from the Meal being created in this request',
	})
	@IsUUID()
	foodId: string;

	@ApiProperty({
		example: 175,
		minimum: 0,
		maximum: MAX_MEAL_FOOD_AMOUNT,
		description:
			"Real amount in the Food's unit; zero omits it from the planned snapshot",
	})
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(MAX_MEAL_FOOD_AMOUNT)
	amount: number;
}

export class InlineMealPrescriptionDto extends OmitType(AddMealFromLibraryDto, [
	'mealId',
	'itemOverrides',
] as const) {
	@ApiPropertyOptional({
		type: [InlineMealItemOverrideDto],
		maxItems: MAX_MEAL_ITEMS,
		description:
			'Optional planned-amount replacements keyed by a Food in the new Meal',
	})
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(MAX_MEAL_ITEMS)
	@ValidateNested({ each: true })
	@Type(() => InlineMealItemOverrideDto)
	itemOverrides?: InlineMealItemOverrideDto[];
}

export class CreateLibraryMealAndAddDto {
	@ApiProperty({ type: CreateMealDto })
	@ValidateNested()
	@Type(() => CreateMealDto)
	meal: CreateMealDto;

	@ApiProperty({ type: InlineMealPrescriptionDto })
	@ValidateNested()
	@Type(() => InlineMealPrescriptionDto)
	prescription: InlineMealPrescriptionDto;
}

export class UpdatePlannedMealDto {
	@ApiPropertyOptional({ enum: MealSlot })
	@IsOptional()
	@IsEnum(MealSlot)
	slot?: MealSlot;

	@ApiPropertyOptional({
		minimum: 1,
		maximum: MAX_PLANNED_MEALS_PER_DAY,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(MAX_PLANNED_MEALS_PER_DAY)
	position?: number;

	@ApiPropertyOptional({ nullable: true, example: '13:15' })
	@IsOptional()
	@Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/, {
		message: 'suggestedTime must use HH:mm 24-hour format',
	})
	suggestedTime?: string | null;

	@ApiPropertyOptional({ nullable: true, maxLength: 5000 })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	coachNotes?: string | null;
}

export class PlannedMealFoodAmountDto {
	@ApiProperty({ format: 'uuid', description: 'Existing planned Meal Food id' })
	@IsUUID()
	plannedMealFoodId: string;

	@ApiProperty({
		example: 200,
		minimum: 0.01,
		maximum: MAX_MEAL_FOOD_AMOUNT,
	})
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@IsPositive()
	@Max(MAX_MEAL_FOOD_AMOUNT)
	amount: number;
}

export class ReplacePlannedMealItemsDto {
	@ApiProperty({
		type: [PlannedMealFoodAmountDto],
		minItems: 1,
		maxItems: MAX_MEAL_ITEMS,
		description:
			'Every current planned Food exactly once, in the desired order, with replacement amounts',
	})
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(MAX_MEAL_ITEMS)
	@ValidateNested({ each: true })
	@Type(() => PlannedMealFoodAmountDto)
	items: PlannedMealFoodAmountDto[];
}
