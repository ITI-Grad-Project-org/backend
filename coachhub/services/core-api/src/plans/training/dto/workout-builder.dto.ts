import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsBoolean,
	IsInt,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { CreateExerciseDto } from '../../../exercises/dto/create-exercise.dto';
import {
	PrescribedSetDto,
	PrescribeExerciseDto,
} from './prescribe-exercise.dto';

export class UpdateProgramDayDto {
	@ApiPropertyOptional({ nullable: true, maxLength: 150 })
	@IsOptional()
	@IsString()
	@MaxLength(150)
	name?: string | null;

	@ApiPropertyOptional({ nullable: true })
	@IsOptional()
	@IsString()
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
	@ApiPropertyOptional({ minimum: 1 })
	@IsOptional()
	@IsInt()
	@Min(1)
	position?: number;

	@ApiPropertyOptional({ minimum: 1, nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	supersetGroup?: number | null;

	@ApiPropertyOptional({ minimum: 0 })
	@IsOptional()
	@IsInt()
	@Min(0)
	restSeconds?: number;

	@ApiPropertyOptional({ example: '3-1-1-0', nullable: true })
	@IsOptional()
	@Matches(/^\d-\d-\d-\d$/)
	tempo?: string | null;

	@ApiPropertyOptional({ nullable: true })
	@IsOptional()
	@IsString()
	coachNotes?: string | null;
}

export class ReplacePlannedSetsDto {
	@ApiProperty({ type: [PrescribedSetDto] })
	@ValidateNested({ each: true })
	@Type(() => PrescribedSetDto)
	@ArrayMinSize(1)
	@ArrayMaxSize(20)
	sets: PrescribedSetDto[];
}
