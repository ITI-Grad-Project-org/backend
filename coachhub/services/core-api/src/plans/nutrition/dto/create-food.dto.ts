import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsPositive,
	IsString,
	Matches,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { DietaryPreference, ServingUnit } from '../../../common';
import {
	FOOD_NUTRIENT_LIMITS,
	MAX_FOOD_REFERENCE_AMOUNT,
} from '../utils/nutrition-validation.utils';

export class CreateFoodDto {
	@ApiProperty({ example: 'Chicken breast' })
	@IsString()
	@IsNotEmpty()
	@Matches(/\S/, { message: 'name must contain a non-whitespace character' })
	@MaxLength(150)
	name: string;

	@ApiPropertyOptional({ example: 'Local butcher', nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	brand?: string | null;

	@ApiProperty({
		example: 100,
		maximum: MAX_FOOD_REFERENCE_AMOUNT,
		description:
			'Reference serving amount; the API applies a stricter maximum for the selected unit',
	})
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@IsPositive()
	@Max(MAX_FOOD_REFERENCE_AMOUNT)
	servingSize: number;

	@ApiProperty({ enum: ServingUnit, example: ServingUnit.G })
	@IsEnum(ServingUnit)
	servingUnit: ServingUnit;

	@ApiProperty({
		example: 165,
		maximum: FOOD_NUTRIENT_LIMITS.calories,
		description: 'Calories per reference serving',
	})
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(FOOD_NUTRIENT_LIMITS.calories)
	calories: number;

	@ApiProperty({
		example: 31,
		maximum: FOOD_NUTRIENT_LIMITS.proteinG,
		description: 'Protein grams per serving',
	})
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(FOOD_NUTRIENT_LIMITS.proteinG)
	proteinG: number;

	@ApiProperty({
		example: 0,
		maximum: FOOD_NUTRIENT_LIMITS.carbsG,
		description: 'Carbohydrate grams per serving',
	})
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(FOOD_NUTRIENT_LIMITS.carbsG)
	carbsG: number;

	@ApiProperty({
		example: 3.6,
		maximum: FOOD_NUTRIENT_LIMITS.fatG,
		description: 'Fat grams per serving',
	})
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(FOOD_NUTRIENT_LIMITS.fatG)
	fatG: number;

	@ApiPropertyOptional({
		example: 0,
		nullable: true,
		maximum: FOOD_NUTRIENT_LIMITS.fiberG,
		description: 'Fiber grams per serving',
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(FOOD_NUTRIENT_LIMITS.fiberG)
	fiberG?: number | null;

	@ApiPropertyOptional({
		enum: DietaryPreference,
		isArray: true,
		example: [DietaryPreference.HALAL],
	})
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(10)
	@IsEnum(DietaryPreference, { each: true })
	dietaryTags?: DietaryPreference[];

	@ApiPropertyOptional({
		type: [String],
		example: ['milk'],
		description: 'Allergens are trimmed, lowercased, and deduplicated',
	})
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(50)
	@IsString({ each: true })
	@Matches(/\S/, {
		each: true,
		message: 'each allergen must contain a non-whitespace character',
	})
	@MaxLength(100, { each: true })
	allergens?: string[];
}
