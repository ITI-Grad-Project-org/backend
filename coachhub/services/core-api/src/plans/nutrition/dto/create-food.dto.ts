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

	@ApiProperty({ example: 100, description: 'Reference serving amount' })
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@IsPositive()
	@Max(999999.99)
	servingSize: number;

	@ApiProperty({ enum: ServingUnit, example: ServingUnit.G })
	@IsEnum(ServingUnit)
	servingUnit: ServingUnit;

	@ApiProperty({ example: 165, description: 'Calories per reference serving' })
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(999999.99)
	calories: number;

	@ApiProperty({ example: 31, description: 'Protein grams per serving' })
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(99999.99)
	proteinG: number;

	@ApiProperty({ example: 0, description: 'Carbohydrate grams per serving' })
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(99999.99)
	carbsG: number;

	@ApiProperty({ example: 3.6, description: 'Fat grams per serving' })
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(99999.99)
	fatG: number;

	@ApiPropertyOptional({
		example: 0,
		nullable: true,
		description: 'Fiber grams per serving',
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(99999.99)
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
