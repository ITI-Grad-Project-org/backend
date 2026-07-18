import {
	ApiProperty,
	ApiPropertyOptional,
	PartialType,
	PickType,
} from '@nestjs/swagger';
import {
	IsDateString,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { DifficultyLevel, FitnessGoal } from '../../../common';

export class CreateClientProgramDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	membershipId: string;

	@ApiProperty({ example: "Ahmed's Strength Plan", maxLength: 150 })
	@IsString()
	@IsNotEmpty()
	@Matches(/\S/, { message: 'name must contain a non-whitespace character' })
	@MaxLength(150)
	name: string;

	@ApiPropertyOptional({ example: 'Eight-week strength phase' })
	@IsOptional()
	@IsString()
	description?: string | null;

	@ApiPropertyOptional({ enum: FitnessGoal })
	@IsOptional()
	@IsEnum(FitnessGoal)
	goal?: FitnessGoal | null;

	@ApiPropertyOptional({ enum: DifficultyLevel })
	@IsOptional()
	@IsEnum(DifficultyLevel)
	difficulty?: DifficultyLevel | null;

	@ApiProperty({ example: 8, minimum: 1, maximum: 52 })
	@IsInt()
	@Min(1)
	@Max(52)
	durationWeeks: number;

	@ApiProperty({ example: '2026-07-17', format: 'date' })
	@IsDateString({ strict: true })
	@Matches(/^\d{4}-\d{2}-\d{2}$/, {
		message: 'startDate must use YYYY-MM-DD date-only format',
	})
	startDate: string;
}

export class UpdateClientProgramDto extends PartialType(
	PickType(CreateClientProgramDto, [
		'name',
		'description',
		'goal',
		'difficulty',
		'startDate',
	] as const),
) {}
