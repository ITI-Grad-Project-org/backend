import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsIn,
	IsInt,
	IsNumber,
	IsOptional,
	IsUUID,
	Max,
	Min,
} from 'class-validator';
import { SetOutcome } from '../../../common';

const SUBMITTED_SET_OUTCOMES = [
	SetOutcome.COMPLETED,
	SetOutcome.PARTIAL,
	SetOutcome.SKIPPED,
];
const EXTRA_SET_OUTCOMES = [SetOutcome.COMPLETED, SetOutcome.PARTIAL];

class ActualSetValuesDto {
	@ApiPropertyOptional({ example: 10, nullable: true })
	@IsOptional()
	@IsInt()
	@Min(0)
	reps?: number | null;

	@ApiPropertyOptional({ example: 72.5, nullable: true })
	@IsOptional()
	@IsNumber()
	@Min(0)
	weightKg?: number | null;

	@ApiPropertyOptional({ example: 60, nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	durationSeconds?: number | null;

	@ApiPropertyOptional({
		example: 8.5,
		minimum: 1,
		maximum: 10,
		nullable: true,
	})
	@IsOptional()
	@IsNumber()
	@Min(1)
	@Max(10)
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
