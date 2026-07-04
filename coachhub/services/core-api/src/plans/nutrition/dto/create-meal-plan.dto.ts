import {
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

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
}

export class UpdateMealPlanDto extends PartialType(CreateMealPlanDto) {}
