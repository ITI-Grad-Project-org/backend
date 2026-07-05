import {
	IsBoolean,
	IsEnum,
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
import { DifficultyLevel, FitnessGoal } from 'src/common';

export class CreateProgramDto {
	@ApiProperty({ example: 'Push Pull Legs — 8 weeks' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	name: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	description?: string;

	@ApiPropertyOptional({ enum: FitnessGoal })
	@IsOptional()
	@IsEnum(FitnessGoal)
	goal?: FitnessGoal;

	@ApiPropertyOptional({ enum: DifficultyLevel })
	@IsOptional()
	@IsEnum(DifficultyLevel)
	difficulty?: DifficultyLevel;

	@ApiProperty({
		example: 8,
		minimum: 1,
		maximum: 52,
		description: 'Server inserts this many weeks + 7 days each',
	})
	@IsInt()
	@Min(1)
	@Max(52)
	weeks: number;

	@ApiPropertyOptional({ default: true })
	@IsOptional()
	@IsBoolean()
	isTemplate?: boolean;
}

/** Weeks are managed via add/duplicate-week endpoints, not by update. */
export class UpdateProgramDto extends PartialType(
	OmitType(CreateProgramDto, ['weeks'] as const),
) {}
