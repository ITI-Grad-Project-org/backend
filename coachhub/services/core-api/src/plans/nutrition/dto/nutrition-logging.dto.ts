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
	NutritionLogStatus,
	ServingUnit,
} from '../../../common';
import {
	ClientNutritionNutrientsResponseDto,
	ClientPlannedFoodResponseDto,
} from './client-nutrition-response.dto';
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

export class ActualNutritionTotalsResponseDto {
	@ApiProperty({ nullable: true, example: 430 })
	calories: number | null;

	@ApiProperty({ nullable: true, example: 32 })
	proteinG: number | null;

	@ApiProperty({ nullable: true, example: 45 })
	carbsG: number | null;

	@ApiProperty({ nullable: true, example: 14 })
	fatG: number | null;

	@ApiProperty({ nullable: true, example: 6 })
	fiberG: number | null;
}

export class ClientActualFoodLogResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid', nullable: true })
	loggedMealId: string | null;

	@ApiProperty({ format: 'uuid', nullable: true })
	foodId: string | null;

	@ApiProperty({ enum: ['library', 'manual'] })
	source: 'library' | 'manual';

	@ApiProperty({ enum: MealSlot })
	mealSlot: MealSlot;

	@ApiProperty()
	foodName: string;

	@ApiProperty({ nullable: true })
	brand: string | null;

	@ApiProperty({ nullable: true })
	servingSize: number | null;

	@ApiProperty({ enum: ServingUnit, nullable: true })
	servingUnit: ServingUnit | null;

	@ApiProperty({ nullable: true })
	amount: number | null;

	@ApiProperty({ type: () => ActualNutritionTotalsResponseDto })
	nutrients: ActualNutritionTotalsResponseDto;

	@ApiProperty({ nullable: true })
	clientNotes: string | null;

	@ApiProperty({ format: 'date-time' })
	loggedAt: Date;

	@ApiProperty({ format: 'date-time' })
	createdAt: Date;

	@ApiProperty({ format: 'date-time' })
	updatedAt: Date;
}

export class ClientLoggedMealResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	plannedMealId: string;

	@ApiProperty({ format: 'uuid' })
	sourceMealId: string;

	@ApiProperty({ example: 'Breakfast' })
	mealName: string;

	@ApiProperty({ enum: MealSlot })
	slot: MealSlot;

	@ApiProperty({ example: 1 })
	position: number;

	@ApiProperty({ type: () => ClientNutritionNutrientsResponseDto })
	prescribedTotals: ClientNutritionNutrientsResponseDto;

	@ApiProperty({ enum: NutritionAdherenceOutcome })
	outcome: NutritionAdherenceOutcome;

	@ApiProperty({ nullable: true })
	clientNotes: string | null;

	@ApiProperty({ type: () => ActualNutritionTotalsResponseDto })
	actualTotals: ActualNutritionTotalsResponseDto;

	@ApiProperty({
		type: () => ClientPlannedFoodResponseDto,
		isArray: true,
		description:
			'Immutable prescribed Food detail read from the planned Meal snapshot',
	})
	plannedFoods: ClientPlannedFoodResponseDto[];
}

export class ClientNutritionDayLogDetailResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	nutritionPlanId: string;

	@ApiProperty({ format: 'uuid' })
	nutritionPlanDayId: string;

	@ApiProperty({ format: 'date', example: '2026-07-26' })
	scheduledDate: string;

	@ApiProperty({ enum: NutritionLogStatus })
	status: NutritionLogStatus;

	@ApiProperty({
		enum: [
			'in_progress',
			'incomplete',
			'completed',
			'partial',
			'skipped',
			'not_applicable',
		],
	})
	logState:
		| 'in_progress'
		| 'incomplete'
		| 'completed'
		| 'partial'
		| 'skipped'
		| 'not_applicable';

	@ApiProperty({ enum: NutritionAdherenceOutcome, nullable: true })
	adherenceOutcome: NutritionAdherenceOutcome | null;

	@ApiProperty({ nullable: true, example: 2200 })
	waterMlConsumed: number | null;

	@ApiProperty({ nullable: true })
	clientNotes: string | null;

	@ApiProperty({ format: 'date-time' })
	startedAt: Date;

	@ApiProperty({ format: 'date-time', nullable: true })
	completedAt: Date | null;

	@ApiProperty()
	isRetrospective: boolean;

	@ApiProperty()
	isWritable: boolean;

	@ApiProperty({ type: () => ActualNutritionTotalsResponseDto })
	actualTotals: ActualNutritionTotalsResponseDto;

	@ApiProperty({ type: () => ClientActualFoodLogResponseDto, isArray: true })
	actualFoods: ClientActualFoodLogResponseDto[];

	@ApiProperty({ type: () => ClientLoggedMealResponseDto, isArray: true })
	meals: ClientLoggedMealResponseDto[];
}
