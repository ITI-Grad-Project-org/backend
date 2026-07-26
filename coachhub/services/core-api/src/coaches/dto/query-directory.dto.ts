import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CoachSpecialty } from '../../common';

const trimToUndefined = ({ value }: { value: unknown }) => {
	if (typeof value !== 'string') return value;
	const trimmed = value.trim();
	return trimmed === '' ? undefined : trimmed;
};

export class QueryDirectoryDto {
	@ApiPropertyOptional({
		description: 'Free-text match on coach name or business name',
		example: 'marco',
	})
	@Transform(trimToUndefined)
	@IsOptional()
	@IsString()
	search?: string;

	@ApiPropertyOptional({ enum: CoachSpecialty })
	@Transform(trimToUndefined)
	@IsOptional()
	@IsEnum(CoachSpecialty)
	specialty?: CoachSpecialty;

	@ApiPropertyOptional({ example: 1, default: 1 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number = 1;

	@ApiPropertyOptional({ example: 20, default: 20, maximum: 50 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(50)
	limit?: number = 20;
}
