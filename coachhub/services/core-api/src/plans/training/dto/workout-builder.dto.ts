import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsInt,
	IsOptional,
	IsString,
	Matches,
	Max,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { CreateExerciseDto } from '../../../exercises/dto/create-exercise.dto';
import {
	PrescribedSetDto,
	PrescribeExerciseDto,
} from './prescribe-exercise.dto';
import {
	TEMPO_PATTERN,
	TRAINING_VALIDATION_LIMITS,
} from '../utils/training-validation.constants';

export class UpdateProgramDayDto {
	@ApiPropertyOptional({ nullable: true, maxLength: 150 })
	@IsOptional()
	@IsString()
	@MaxLength(150)
	name?: string | null;

	@ApiPropertyOptional({
		nullable: true,
		maxLength: TRAINING_VALIDATION_LIMITS.dayNotesLength,
	})
	@IsOptional()
	@IsString()
	@MaxLength(TRAINING_VALIDATION_LIMITS.dayNotesLength)
	notes?: string | null;

	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	isRestDay?: boolean;
}

export class InlineExercisePrescriptionDto extends OmitType(
	PrescribeExerciseDto,
	['exerciseId'] as const,
) {}

export class CreateAndPrescribeExerciseDto {
	@ApiProperty({ type: CreateExerciseDto })
	@ValidateNested()
	@Type(() => CreateExerciseDto)
	exercise: CreateExerciseDto;

	@ApiProperty({ type: InlineExercisePrescriptionDto })
	@ValidateNested()
	@Type(() => InlineExercisePrescriptionDto)
	prescription: InlineExercisePrescriptionDto;
}

export class UpdatePlannedExerciseDto {
	@ApiPropertyOptional({
		minimum: 1,
		maximum: TRAINING_VALIDATION_LIMITS.exercisesPerDay,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(TRAINING_VALIDATION_LIMITS.exercisesPerDay)
	position?: number;

	@ApiPropertyOptional({
		minimum: 1,
		maximum: TRAINING_VALIDATION_LIMITS.exercisesPerDay,
		nullable: true,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(TRAINING_VALIDATION_LIMITS.exercisesPerDay)
	supersetGroup?: number | null;

	@ApiPropertyOptional({
		minimum: 0,
		maximum: TRAINING_VALIDATION_LIMITS.restSeconds,
	})
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(TRAINING_VALIDATION_LIMITS.restSeconds)
	restSeconds?: number;

	@ApiPropertyOptional({
		example: '3-1-X-0',
		description:
			'Four tempo phases; each phase accepts a digit or X for an explosive phase',
		nullable: true,
	})
	@IsOptional()
	@Matches(TEMPO_PATTERN, {
		message: 'tempo must use four digit-or-X phases such as 3-1-X-0',
	})
	tempo?: string | null;

	@ApiPropertyOptional({
		nullable: true,
		maxLength: TRAINING_VALIDATION_LIMITS.coachNotesLength,
	})
	@IsOptional()
	@IsString()
	@MaxLength(TRAINING_VALIDATION_LIMITS.coachNotesLength)
	coachNotes?: string | null;
}

export class ReplacePlannedSetsDto {
	@ApiProperty({
		type: [PrescribedSetDto],
		minItems: 1,
		maxItems: TRAINING_VALIDATION_LIMITS.setsPerExercise,
	})
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => PrescribedSetDto)
	@ArrayMinSize(1)
	@ArrayMaxSize(TRAINING_VALIDATION_LIMITS.setsPerExercise)
	sets: PrescribedSetDto[];
}
