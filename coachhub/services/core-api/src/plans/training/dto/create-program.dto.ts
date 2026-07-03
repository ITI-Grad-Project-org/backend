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
}                                           from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType }                      from '@nestjs/swagger';
import { DifficultyLevel, FitnessGoal }     from 'src/common';

export class CreateProgramDto {
	@ApiProperty( { example: 'Push Pull Legs — 8 weeks' } )
	@IsString()
	@IsNotEmpty()
	@MaxLength( 150 )
	name: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	description?: string;

	@ApiPropertyOptional( { enum: FitnessGoal } )
	@IsOptional()
	@IsEnum( FitnessGoal )
	goal?: FitnessGoal;

	@ApiPropertyOptional( { enum: DifficultyLevel } )
	@IsOptional()
	@IsEnum( DifficultyLevel )
	difficulty?: DifficultyLevel;

	@ApiPropertyOptional( { example: 8, minimum: 1, maximum: 52 } )
	@IsOptional()
	@IsInt()
	@Min( 1 )
	@Max( 52 )
	durationWeeks?: number;

	@ApiPropertyOptional( { default: true } )
	@IsOptional()
	@IsBoolean()
	isTemplate?: boolean;
}

export class UpdateProgramDto extends PartialType( CreateProgramDto ) {}
