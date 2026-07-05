import {
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import {
	ApiProperty,
	ApiPropertyOptional,
	OmitType,
	PartialType,
} from '@nestjs/swagger';

/**
 * Design §7.2 — same board shape as programs: creating a plan inserts
 * `weeks` rows in meal_plan_weeks + 7 meal_plan_days each.
 */
export class CreateMealPlanDto {
	@ApiProperty({ example: 'Cutting Plan — 2200 kcal' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	name: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	description?: string;

	@ApiPropertyOptional({ example: 2200 })
	@IsOptional()
	@IsInt()
	@Min(0)
	targetCalories?: number;

	@ApiPropertyOptional({ example: 180 })
	@IsOptional()
	@IsInt()
	@Min(0)
	targetProteinG?: number;

	@ApiPropertyOptional({ example: 200 })
	@IsOptional()
	@IsInt()
	@Min(0)
	targetCarbsG?: number;

	@ApiPropertyOptional({ example: 70 })
	@IsOptional()
	@IsInt()
	@Min(0)
	targetFatG?: number;

	@ApiProperty({
		example: 4,
		minimum: 1,
		maximum: 52,
		description: 'Server inserts this many weeks + 7 days each',
	})
	@IsInt()
	@Min(1)
	@Max(52)
	weeks: number;
}

/** Weeks are managed via add/duplicate-week endpoints, not by update. */
export class UpdateMealPlanDto extends PartialType(
	OmitType(CreateMealPlanDto, ['weeks'] as const),
) {}
