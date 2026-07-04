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

export class SetLogDto {
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

export class SessionExerciseDto {
	@ApiProperty({
		format: 'uuid',
		description: 'The library exercise performed',
	})
	@IsUUID()
	exerciseId: string;

	@ApiPropertyOptional({
		format: 'uuid',
		description: 'Prescription (workout_exercises row) this was following',
	})
	@IsOptional()
	@IsUUID()
	workoutExerciseId?: string;

	@ApiProperty({ example: 1 })
	@IsInt()
	@Min(1)
	position: number;

	@ApiProperty({ type: [SetLogDto] })
	@ValidateNested({ each: true })
	@Type(() => SetLogDto)
	@ArrayMinSize(1)
	setLogs: SetLogDto[];
}

/** Client app "finish workout" payload → workout_sessions tree (design §4.5). */
export class LogSessionDto {
	@ApiPropertyOptional({
		format: 'uuid',
		description: 'Active program assignment (omit for ad-hoc sessions)',
	})
	@IsOptional()
	@IsUUID()
	assignmentId?: string;

	@ApiPropertyOptional({
		format: 'uuid',
		description: 'Planned workout day this session fulfils (omit = ad-hoc)',
	})
	@IsOptional()
	@IsUUID()
	programWorkoutId?: string;

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

	@ApiProperty({ type: [SessionExerciseDto] })
	@ValidateNested({ each: true })
	@Type(() => SessionExerciseDto)
	@ArrayMinSize(1)
	exercises: SessionExerciseDto[];
}
