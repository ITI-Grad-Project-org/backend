import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsIn,
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { SetOutcome } from '../../../common';
import { TRAINING_VALIDATION_LIMITS } from '../utils/training-validation.constants';

const SUBMITTED_SET_OUTCOMES = [
	SetOutcome.COMPLETED,
	SetOutcome.PARTIAL,
	SetOutcome.SKIPPED,
];
const EXTRA_SET_OUTCOMES = [SetOutcome.COMPLETED, SetOutcome.PARTIAL];

class ActualSetValuesDto {
	@ApiPropertyOptional({
		example: 10,
		minimum: 0,
		maximum: TRAINING_VALIDATION_LIMITS.repetitions,
		nullable: true,
	})
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(TRAINING_VALIDATION_LIMITS.repetitions)
	reps?: number | null;

	@ApiPropertyOptional({
		example: 72.5,
		minimum: 0,
		maximum: TRAINING_VALIDATION_LIMITS.weightKg,
		nullable: true,
	})
	@IsOptional()
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(TRAINING_VALIDATION_LIMITS.weightKg)
	weightKg?: number | null;

	@ApiPropertyOptional({
		example: 60,
		minimum: 1,
		maximum: TRAINING_VALIDATION_LIMITS.setDurationSeconds,
		nullable: true,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(TRAINING_VALIDATION_LIMITS.setDurationSeconds)
	durationSeconds?: number | null;

	@ApiPropertyOptional({
		example: 8.5,
		minimum: 1,
		maximum: 10,
		nullable: true,
	})
	@IsOptional()
	@IsNumber({ maxDecimalPlaces: 1 })
	@Min(1)
	@Max(TRAINING_VALIDATION_LIMITS.rpe)
	rpe?: number | null;
}

export class UpdatePrescribedLoggedSetDto extends ActualSetValuesDto {
	@ApiProperty({ enum: SUBMITTED_SET_OUTCOMES })
	@IsIn(SUBMITTED_SET_OUTCOMES)
	outcome: SetOutcome;
}

export class CreateExtraLoggedSetDto extends ActualSetValuesDto {
	@ApiProperty({
		format: 'uuid',
		description:
			'Existing prescribed logged exercise that receives the extra set',
	})
	@IsUUID()
	loggedExerciseId: string;

	@ApiProperty({ enum: EXTRA_SET_OUTCOMES })
	@IsIn(EXTRA_SET_OUTCOMES)
	outcome: SetOutcome;
}

export class CompleteWorkoutDto {
	@ApiPropertyOptional({
		example: 55,
		minimum: 1,
		maximum: TRAINING_VALIDATION_LIMITS.workoutDurationMinutes,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(TRAINING_VALIDATION_LIMITS.workoutDurationMinutes)
	durationMinutes?: number;

	@ApiPropertyOptional({ example: 'Felt strong today', maxLength: 5000 })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	clientNotes?: string;

	@ApiPropertyOptional({ example: 8.5, minimum: 1, maximum: 10 })
	@IsOptional()
	@IsNumber({ maxDecimalPlaces: 1 })
	@Min(1)
	@Max(TRAINING_VALIDATION_LIMITS.rpe)
	overallRpe?: number;
}
