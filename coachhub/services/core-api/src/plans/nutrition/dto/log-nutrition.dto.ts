import {
	IsDateString,
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
	ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealSlot } from 'src/common';

export class LogNutritionDto {
	@ApiProperty({ enum: MealSlot, example: MealSlot.BREAKFAST })
	@IsEnum(MealSlot)
	mealType: MealSlot;

	@ApiPropertyOptional({ format: 'uuid' })
	@ValidateIf((o) => o.freeText == null)
	@IsUUID()
	foodId?: string;

	@ApiPropertyOptional({ example: 'Shawarma sandwich from the corner place' })
	@ValidateIf((o) => o.foodId == null)
	@IsString()
	@MaxLength(200)
	freeText?: string;

	@ApiPropertyOptional({ example: 1.5, description: "× the food's serving" })
	@IsOptional()
	@IsNumber()
	@Min(0.1)
	quantity?: number;

	@ApiPropertyOptional({ example: '2026-07-03T09:00:00Z' })
	@IsOptional()
	@IsDateString()
	loggedAt?: string;

	@ApiPropertyOptional({ example: 550 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	calories?: number;

	@ApiPropertyOptional({ example: 30 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	proteinG?: number;

	@ApiPropertyOptional({ example: 45 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	carbsG?: number;

	@ApiPropertyOptional({ example: 25 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	fatG?: number;
}
