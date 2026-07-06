import {
	ArrayMinSize,
	IsBoolean,
	IsDateString,
	IsEnum,
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SessionStatus } from 'src/common';

export class LoggedSetDto {
	@ApiProperty({ example: 1 })
	@IsInt()
	@Min(1)
	setNumber: number;

	@ApiPropertyOptional({ example: 10 })
	@IsOptional()
	@IsInt()
	@Min(0)
	reps?: number;

	@ApiPropertyOptional({ example: 72.5 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	weightKg?: number;

	@ApiPropertyOptional({ example: 60 })
	@IsOptional()
	@IsInt()
	@Min(1)
	durationSeconds?: number;

	@ApiPropertyOptional({ example: 8.5, minimum: 1, maximum: 10 })
	@IsOptional()
	@IsNumber()
	@Min(1)
	@Max(10)
	rpe?: number;

	@ApiPropertyOptional({ default: true })
	@IsOptional()
	@IsBoolean()
	isCompleted?: boolean;
}

export class LoggedExerciseDto {
	@ApiProperty({
		format: 'uuid',
		description: 'The library exercise performed',
	})
	@IsUUID()
	exerciseId: string;

	@ApiPropertyOptional({
		format: 'uuid',
		description: 'Prescription (planned_exercises row) this was following',
	})
	@IsOptional()
	@IsUUID()
	plannedExerciseId?: string;

	@ApiProperty({ example: 1 })
	@IsInt()
	@Min(1)
	position: number;

	@ApiProperty({ type: [LoggedSetDto] })
	@ValidateNested({ each: true })
	@Type(() => LoggedSetDto)
	@ArrayMinSize(1)
	sets: LoggedSetDto[];
}

export class LogWorkoutDto {
	@ApiPropertyOptional({
		format: 'uuid',
		description: 'Active program assignment (omit for ad-hoc sessions)',
	})
	@IsOptional()
	@IsUUID()
	assignmentId?: string;

	@ApiPropertyOptional({
		format: 'uuid',
		description: 'Planned board day this workout fulfils (omit = ad-hoc)',
	})
	@IsOptional()
	@IsUUID()
	programDayId?: string;

	@ApiPropertyOptional({ example: '2026-07-03T18:30:00Z' })
	@IsOptional()
	@IsDateString()
	performedAt?: string;

	@ApiPropertyOptional({ example: 55 })
	@IsOptional()
	@IsInt()
	@Min(1)
	durationMinutes?: number;

	@ApiPropertyOptional({
		enum: SessionStatus,
		default: SessionStatus.COMPLETED,
	})
	@IsOptional()
	@IsEnum(SessionStatus)
	status?: SessionStatus;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	clientNotes?: string;

	@ApiProperty({ type: [LoggedExerciseDto] })
	@ValidateNested({ each: true })
	@Type(() => LoggedExerciseDto)
	@ArrayMinSize(1)
	exercises: LoggedExerciseDto[];
}
