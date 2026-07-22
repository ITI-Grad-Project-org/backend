import {
	ApiProperty,
	ApiPropertyOptional,
	PartialType,
	PickType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsDateString,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { FitnessGoal } from '../../../common';
import { NUTRITION_TARGET_LIMITS } from '../utils/nutrition-validation.utils';

export class CreateClientNutritionPlanDto {
	@ApiProperty({ format: 'uuid', description: 'Active client membership id' })
	@IsUUID()
	membershipId: string;

	@ApiProperty({ example: "Ahmed's Fat-Loss Plan", maxLength: 150 })
	@IsString()
	@IsNotEmpty()
	@Matches(/\S/, { message: 'name must contain a non-whitespace character' })
	@MaxLength(150)
	name: string;

	@ApiPropertyOptional({
		example: 'Two-week introductory nutrition plan',
		maxLength: 5000,
		nullable: true,
	})
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	description?: string | null;

	@ApiPropertyOptional({ enum: FitnessGoal, nullable: true })
	@IsOptional()
	@IsEnum(FitnessGoal)
	goal?: FitnessGoal | null;

	@ApiProperty({ example: 4, minimum: 1, maximum: 52 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(52)
	durationWeeks: number;

	@ApiProperty({ example: '2026-07-22', format: 'date' })
	@IsDateString({ strict: true })
	@Matches(/^\d{4}-\d{2}-\d{2}$/, {
		message: 'startDate must use YYYY-MM-DD date-only format',
	})
	startDate: string;

	@ApiPropertyOptional({
		example: 2200,
		minimum: NUTRITION_TARGET_LIMITS.calories.min,
		maximum: NUTRITION_TARGET_LIMITS.calories.max,
		nullable: true,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(NUTRITION_TARGET_LIMITS.calories.min)
	@Max(NUTRITION_TARGET_LIMITS.calories.max)
	targetCalories?: number | null;

	@ApiPropertyOptional({
		example: 170,
		minimum: NUTRITION_TARGET_LIMITS.proteinG.min,
		maximum: NUTRITION_TARGET_LIMITS.proteinG.max,
		nullable: true,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(NUTRITION_TARGET_LIMITS.proteinG.min)
	@Max(NUTRITION_TARGET_LIMITS.proteinG.max)
	targetProteinG?: number | null;

	@ApiPropertyOptional({
		example: 230,
		minimum: NUTRITION_TARGET_LIMITS.carbsG.min,
		maximum: NUTRITION_TARGET_LIMITS.carbsG.max,
		nullable: true,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(NUTRITION_TARGET_LIMITS.carbsG.min)
	@Max(NUTRITION_TARGET_LIMITS.carbsG.max)
	targetCarbsG?: number | null;

	@ApiPropertyOptional({
		example: 65,
		minimum: NUTRITION_TARGET_LIMITS.fatG.min,
		maximum: NUTRITION_TARGET_LIMITS.fatG.max,
		nullable: true,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(NUTRITION_TARGET_LIMITS.fatG.min)
	@Max(NUTRITION_TARGET_LIMITS.fatG.max)
	targetFatG?: number | null;

	@ApiPropertyOptional({
		example: 30,
		minimum: NUTRITION_TARGET_LIMITS.fiberG.min,
		maximum: NUTRITION_TARGET_LIMITS.fiberG.max,
		nullable: true,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(NUTRITION_TARGET_LIMITS.fiberG.min)
	@Max(NUTRITION_TARGET_LIMITS.fiberG.max)
	targetFiberG?: number | null;

	@ApiPropertyOptional({
		example: 3000,
		minimum: NUTRITION_TARGET_LIMITS.waterMl.min,
		maximum: NUTRITION_TARGET_LIMITS.waterMl.max,
		nullable: true,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(NUTRITION_TARGET_LIMITS.waterMl.min)
	@Max(NUTRITION_TARGET_LIMITS.waterMl.max)
	targetWaterMl?: number | null;
}

export class UpdateClientNutritionPlanDto extends PartialType(
	PickType(CreateClientNutritionPlanDto, [
		'name',
		'description',
		'goal',
		'startDate',
		'targetCalories',
		'targetProteinG',
		'targetCarbsG',
		'targetFatG',
		'targetFiberG',
		'targetWaterMl',
	] as const),
) {}
