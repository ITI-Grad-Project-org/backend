import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsPositive,
	IsString,
	IsUrl,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import { DietaryPreference } from '../../../common';
import {
	MAX_MEAL_FOOD_AMOUNT,
	MAX_MEAL_ITEMS,
} from '../utils/nutrition-validation.utils';

export class MealItemDto {
	@ApiProperty({ format: 'uuid', description: 'Active tenant Food id' })
	@IsUUID()
	foodId: string;

	@ApiProperty({
		example: 150,
		maximum: MAX_MEAL_FOOD_AMOUNT,
		description: "Real amount in the referenced Food's serving unit",
	})
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@IsPositive()
	@Max(MAX_MEAL_FOOD_AMOUNT)
	amount: number;
}

export class CreateMealDto {
	@ApiProperty({ example: 'Chicken and rice' })
	@IsString()
	@IsNotEmpty()
	@Matches(/\S/, { message: 'name must contain a non-whitespace character' })
	@MaxLength(150)
	name: string;

	@ApiPropertyOptional({ nullable: true, maxLength: 2000 })
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	description?: string | null;

	@ApiPropertyOptional({
		nullable: true,
		example: 'https://cdn.example/meal.jpg',
	})
	@IsOptional()
	@IsUrl()
	@MaxLength(2000)
	photoUrl?: string | null;

	@ApiPropertyOptional({ nullable: true, maxLength: 5000 })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	prepNotes?: string | null;

	@ApiPropertyOptional({ enum: DietaryPreference, isArray: true })
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(10)
	@IsEnum(DietaryPreference, { each: true })
	dietaryTags?: DietaryPreference[];

	@ApiPropertyOptional({
		type: [String],
		description: 'Meal-level allergen additions, normalized by the API',
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

	@ApiProperty({
		type: [MealItemDto],
		minItems: 1,
		maxItems: MAX_MEAL_ITEMS,
	})
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(MAX_MEAL_ITEMS)
	@ValidateNested({ each: true })
	@Type(() => MealItemDto)
	items: MealItemDto[];
}
