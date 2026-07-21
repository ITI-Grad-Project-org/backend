import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateMealDto } from './create-meal.dto';

export class UpdateMealDto extends PartialType(
	OmitType(CreateMealDto, ['items'] as const),
) {
	@ApiPropertyOptional({
		description: 'Set true to restore an archived Meal',
	})
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}
