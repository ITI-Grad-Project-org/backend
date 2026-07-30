import {
	IsBoolean,
	IsEnum,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExerciseCategory, MuscleGroup } from '../../common';

export class QueryExercisesDto {
	@ApiPropertyOptional({ enum: ExerciseCategory })
	@IsOptional()
	@IsEnum(ExerciseCategory)
	category?: ExerciseCategory;

	@ApiPropertyOptional({ enum: MuscleGroup })
	@IsOptional()
	@IsEnum(MuscleGroup)
	primaryMuscle?: MuscleGroup;

	@ApiPropertyOptional({ description: 'Case-insensitive name search' })
	@IsOptional()
	@IsString()
	@MaxLength(150)
	search?: string;

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@Transform(({ value }) => parseBooleanQueryValue(value))
	@IsBoolean()
	includeInactive?: boolean;
}

function parseBooleanQueryValue(value: unknown) {
	if (value === true || value === 'true') return true;
	if (value === false || value === 'false') return false;
	return value;
}
