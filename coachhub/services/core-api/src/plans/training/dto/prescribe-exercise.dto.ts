import {
	ArrayMaxSize,
	ArrayMinSize,
	IsEnum,
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	Min,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IntensityType, SetType } from '../../../common';

export class PrescribedSetDto {
	@ApiPropertyOptional({ enum: SetType, default: SetType.WORKING })
	@IsOptional()
	@IsEnum(SetType)
	setType?: SetType;

	@ApiPropertyOptional({
		example: 8,
		description: 'Required unless time-based or amrap/to_failure/drop_set',
	})
	@ValidateIf(
		(o) =>
			o.durationSeconds == null &&
			![SetType.AMRAP, SetType.TO_FAILURE, SetType.DROP_SET].includes(
				o.setType,
			),
	)
	@IsInt()
	@Min(1)
	repsMin?: number;

	@ApiPropertyOptional({ example: 10, description: 'Omit = fixed reps' })
	@IsOptional()
	@IsInt()
	@Min(1)
	repsMax?: number;

	@ApiPropertyOptional({
		example: 60,
		description: 'Time-based alternative (planks, cardio)',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	durationSeconds?: number;

	@ApiPropertyOptional({ example: 70, description: 'Omit = bodyweight / open' })
	@IsOptional()
	@IsNumber()
	@Min(0)
	weightKg?: number;

	@ApiPropertyOptional({ enum: IntensityType })
	@ValidateIf((o) => o.intensityValue != null)
	@IsEnum(IntensityType)
	intensityType?: IntensityType;

	@ApiPropertyOptional({
		example: 8,
		description: 'RPE 8.5 / RIR 2 / 75 (%1RM)',
	})
	@ValidateIf((o) => o.intensityType != null)
	@IsNumber()
	intensityValue?: number;
}

export class PrescribeExerciseDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	exerciseId: string;

	@ApiPropertyOptional({ description: 'Default: append to the end of the day' })
	@IsOptional()
	@IsInt()
	@Min(1)
	position?: number;

	@ApiPropertyOptional({
		example: 1,
		description: 'Exercises sharing a group are a superset',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	supersetGroup?: number;

	@ApiPropertyOptional({ example: 90, default: 90 })
	@IsOptional()
	@IsInt()
	@Min(0)
	restSeconds?: number;

	@ApiPropertyOptional({ example: '3-1-1-0' })
	@IsOptional()
	@Matches(/^\d-\d-\d-\d$/)
	tempo?: string;

	@ApiPropertyOptional({ description: 'The blue "Coach note" banner' })
	@IsOptional()
	@IsString()
	coachNotes?: string;

	@ApiProperty({
		type: [PrescribedSetDto],
		description: 'One entry per set, in order',
	})
	@ValidateNested({ each: true })
	@Type(() => PrescribedSetDto)
	@ArrayMinSize(1)
	@ArrayMaxSize(20)
	sets: PrescribedSetDto[];
}
