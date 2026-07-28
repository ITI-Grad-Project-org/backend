import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsEnum,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsPositive,
	IsString,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import {
	MealSlot,
	NutritionAdherenceOutcome,
	ServingUnit,
} from '../../../common';
import {
	ACTUAL_FOOD_NUTRIENT_LIMITS,
	MAX_ACTUAL_FOOD_AMOUNT,
	MAX_DAILY_WATER_CONSUMED_ML,
	MAX_FOOD_REFERENCE_AMOUNT,
} from '../utils/nutrition-validation.utils';

const SUBMITTED_MEAL_OUTCOMES = [
	NutritionAdherenceOutcome.COMPLETED,
	NutritionAdherenceOutcome.PARTIAL,
	NutritionAdherenceOutcome.SKIPPED,
];

export class CreateActualFoodLogDto {
	@ApiPropertyOptional({
		format: 'uuid',
		nullable: true,
		description:
			'Active tenant Food for library mode. Omit or send null for a manual entry.',
	})
	@IsOptional()
	@IsUUID()
	foodId?: string | null;

	@ApiPropertyOptional({
		format: 'uuid',
		nullable: true,
		description:
			'Optional Logged Meal in the same day log. Null keeps the entry unlinked.',
	})
	@IsOptional()
	@IsUUID()
	loggedMealId?: string | null;

	@ApiProperty({ enum: MealSlot })
	@IsEnum(MealSlot)
	mealSlot: MealSlot;

	@ApiPropertyOptional({
		example: 'Homemade chicken sandwich',
		maxLength: 200,
		description: 'Required in manual mode.',
	})
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	@Matches(/\S/, {
		message: 'foodName must contain a non-whitespace character',
	})
	@MaxLength(200)
	foodName?: string | null;

	@ApiPropertyOptional({ example: 'Homemade', nullable: true, maxLength: 100 })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	brand?: string | null;

	@ApiPropertyOptional({
		example: 100,
		nullable: true,
		maximum: MAX_FOOD_REFERENCE_AMOUNT,
		description:
			'Optional reference-serving size. The API applies a stricter maximum for the selected unit.',
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@IsPositive()
	@Max(MAX_FOOD_REFERENCE_AMOUNT)
	servingSize?: number | null;

	@ApiPropertyOptional({ enum: ServingUnit, nullable: true })
	@IsOptional()
	@IsEnum(ServingUnit)
	servingUnit?: ServingUnit | null;

	@ApiPropertyOptional({
		example: 150,
		nullable: true,
		description:
			'Required in library mode. In manual mode it is an optional consumed amount.',
		maximum: MAX_ACTUAL_FOOD_AMOUNT,
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@IsPositive()
	@Max(MAX_ACTUAL_FOOD_AMOUNT)
	amount?: number | null;

	@ApiPropertyOptional({
		example: 430,
		nullable: true,
		description: 'Manual-entry total, not a per-serving value.',
		maximum: ACTUAL_FOOD_NUTRIENT_LIMITS.calories,
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(ACTUAL_FOOD_NUTRIENT_LIMITS.calories)
	calories?: number | null;

	@ApiPropertyOptional({
		example: 32,
		nullable: true,
		description: 'Manual-entry total in grams.',
		maximum: ACTUAL_FOOD_NUTRIENT_LIMITS.proteinG,
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(ACTUAL_FOOD_NUTRIENT_LIMITS.proteinG)
	proteinG?: number | null;

	@ApiPropertyOptional({
		example: 45,
		nullable: true,
		description: 'Manual-entry total in grams.',
		maximum: ACTUAL_FOOD_NUTRIENT_LIMITS.carbsG,
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(ACTUAL_FOOD_NUTRIENT_LIMITS.carbsG)
	carbsG?: number | null;

	@ApiPropertyOptional({
		example: 14,
		nullable: true,
		description: 'Manual-entry total in grams.',
		maximum: ACTUAL_FOOD_NUTRIENT_LIMITS.fatG,
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(ACTUAL_FOOD_NUTRIENT_LIMITS.fatG)
	fatG?: number | null;

	@ApiPropertyOptional({
		example: 6,
		nullable: true,
		description: 'Manual-entry total in grams.',
		maximum: ACTUAL_FOOD_NUTRIENT_LIMITS.fiberG,
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(ACTUAL_FOOD_NUTRIENT_LIMITS.fiberG)
	fiberG?: number | null;

	@ApiPropertyOptional({
		example: 'Ate this after training',
		nullable: true,
		maxLength: 5000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	clientNotes?: string | null;
}

export class UpdateActualFoodLogDto extends PartialType(
	CreateActualFoodLogDto,
) {}

export class UpdateNutritionDayLogDto {
	@ApiPropertyOptional({
		example: 2200,
		nullable: true,
		minimum: 0,
		maximum: MAX_DAILY_WATER_CONSUMED_ML,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(MAX_DAILY_WATER_CONSUMED_ML)
	waterMlConsumed?: number | null;

	@ApiPropertyOptional({
		example: 'Felt full throughout the day',
		nullable: true,
		maxLength: 5000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	clientNotes?: string | null;
}

export class UpdateLoggedMealOutcomeDto {
	@ApiProperty({ enum: SUBMITTED_MEAL_OUTCOMES })
	@IsIn(SUBMITTED_MEAL_OUTCOMES)
	outcome: NutritionAdherenceOutcome;

	@ApiPropertyOptional({
		example: 'Ate a smaller portion than prescribed',
		nullable: true,
		maxLength: 5000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	clientNotes?: string | null;
}
