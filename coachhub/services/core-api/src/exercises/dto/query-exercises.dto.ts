import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExerciseCategory, MuscleGroup } from 'src/common';

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
	search?: string;

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@Transform(({ value }) => value === true || value === 'true')
	includeInactive?: boolean;
}
