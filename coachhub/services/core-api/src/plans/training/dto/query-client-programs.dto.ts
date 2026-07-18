import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsBoolean,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';
import { DifficultyLevel, FitnessGoal, ProgramStatus } from '../../../common';

export class QueryClientProgramsDto {
	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	membershipId?: string;

	@ApiPropertyOptional({ enum: ProgramStatus })
	@IsOptional()
	@IsEnum(ProgramStatus)
	status?: ProgramStatus;

	@ApiPropertyOptional({ enum: FitnessGoal })
	@IsOptional()
	@IsEnum(FitnessGoal)
	goal?: FitnessGoal;

	@ApiPropertyOptional({ enum: DifficultyLevel })
	@IsOptional()
	@IsEnum(DifficultyLevel)
	difficulty?: DifficultyLevel;

	@ApiPropertyOptional({ description: 'Case-insensitive program name search' })
	@IsOptional()
	@IsString()
	search?: string;

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@Transform(({ value }) => parseBooleanQueryValue(value))
	@IsBoolean()
	isArchived?: boolean;
}

/**
 * Converts only explicit query-string booleans. Other values are left unchanged
 * so class-validator can reject them instead of silently treating them as true.
 */
function parseBooleanQueryValue(value: unknown) {
	if (value === 'true') return true;
	if (value === 'false') return false;
	return value;
}
