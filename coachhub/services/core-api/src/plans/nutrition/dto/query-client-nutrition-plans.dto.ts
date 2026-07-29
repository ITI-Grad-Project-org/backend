import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsBoolean,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
} from 'class-validator';
import { FitnessGoal, NutritionPlanStatus } from '../../../common';

export class QueryClientNutritionPlansDto {
	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	membershipId?: string;

	@ApiPropertyOptional({ enum: NutritionPlanStatus })
	@IsOptional()
	@IsEnum(NutritionPlanStatus)
	status?: NutritionPlanStatus;

	@ApiPropertyOptional({ enum: FitnessGoal })
	@IsOptional()
	@IsEnum(FitnessGoal)
	goal?: FitnessGoal;

	@ApiPropertyOptional({ description: 'Case-insensitive plan name search' })
	@IsOptional()
	@IsString()
	@MaxLength(150)
	search?: string;

	@ApiPropertyOptional({
		default: false,
		description: 'Select archived instead of active-list plans',
	})
	@IsOptional()
	@Transform(({ value }) => parseBooleanQueryValue(value))
	@IsBoolean()
	isArchived?: boolean;
}

function parseBooleanQueryValue(value: unknown) {
	if (value === true || value === 'true') return true;
	if (value === false || value === 'false') return false;
	return value;
}
