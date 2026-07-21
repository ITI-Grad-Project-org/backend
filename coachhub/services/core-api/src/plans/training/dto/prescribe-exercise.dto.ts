import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsEnum,
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	Min,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { IntensityType, SetType } from '../../../common';
import {
	TEMPO_PATTERN,
	TRAINING_VALIDATION_LIMITS,
} from '../utils/training-validation.constants';

export class PrescribedSetDto {
	@ApiPropertyOptional({ enum: SetType, default: SetType.WORKING })
	@IsOptional()
	@IsEnum(SetType)
	setType?: SetType;

	@ApiPropertyOptional({
		example: 8,
		minimum: 1,
		maximum: TRAINING_VALIDATION_LIMITS.repetitions,
		description: 'Required unless time-based or amrap/to_failure/drop_set',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(TRAINING_VALIDATION_LIMITS.repetitions)
	repsMin?: number;

	@ApiPropertyOptional({
		example: 10,
		minimum: 1,
		maximum: TRAINING_VALIDATION_LIMITS.repetitions,
		description: 'Omit = fixed reps',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(TRAINING_VALIDATION_LIMITS.repetitions)
	repsMax?: number;

	@ApiPropertyOptional({
		example: 60,
		minimum: 1,
		maximum: TRAINING_VALIDATION_LIMITS.setDurationSeconds,
		description: 'Time-based alternative (planks, cardio)',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(TRAINING_VALIDATION_LIMITS.setDurationSeconds)
	durationSeconds?: number;

	@ApiPropertyOptional({
		example: 70,
		minimum: 0,
		maximum: TRAINING_VALIDATION_LIMITS.weightKg,
		description: 'Omit = bodyweight / open',
	})
	@IsOptional()
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(TRAINING_VALIDATION_LIMITS.weightKg)
	weightKg?: number;

	@ApiPropertyOptional({ enum: IntensityType })
	@ValidateIf((o) => o.intensityValue != null)
	@IsEnum(IntensityType)
	intensityType?: IntensityType;

	@ApiPropertyOptional({
		example: 8,
		minimum: 0,
		maximum: TRAINING_VALIDATION_LIMITS.percentOneRepMax,
		description: 'RPE 8.5 / RIR 2 / 75 (%1RM)',
	})
	@ValidateIf((o) => o.intensityType != null)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(TRAINING_VALIDATION_LIMITS.percentOneRepMax)
	intensityValue?: number;
}

export class PrescribeExerciseDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	exerciseId: string;

	@ApiPropertyOptional({
		minimum: 1,
		maximum: TRAINING_VALIDATION_LIMITS.exercisesPerDay,
		description: 'Default: append to the end of the day',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(TRAINING_VALIDATION_LIMITS.exercisesPerDay)
	position?: number;

	@ApiPropertyOptional({
		example: 1,
		minimum: 1,
		maximum: TRAINING_VALIDATION_LIMITS.exercisesPerDay,
		description: 'Exercises sharing a group are a superset',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(TRAINING_VALIDATION_LIMITS.exercisesPerDay)
	supersetGroup?: number;

	@ApiPropertyOptional({
		example: 90,
		default: 90,
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
	})
	@IsOptional()
	@Matches(TEMPO_PATTERN, {
		message: 'tempo must use four digit-or-X phases such as 3-1-X-0',
	})
	tempo?: string;

	@ApiPropertyOptional({ description: 'The blue "Coach note" banner' })
	@IsOptional()
	@IsString()
	@MaxLength(TRAINING_VALIDATION_LIMITS.coachNotesLength)
	coachNotes?: string;

	@ApiProperty({
		type: [PrescribedSetDto],
		minItems: 1,
		maxItems: TRAINING_VALIDATION_LIMITS.setsPerExercise,
		description: 'One entry per set, in order',
	})
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => PrescribedSetDto)
	@ArrayMinSize(1)
	@ArrayMaxSize(TRAINING_VALIDATION_LIMITS.setsPerExercise)
	sets: PrescribedSetDto[];
}
