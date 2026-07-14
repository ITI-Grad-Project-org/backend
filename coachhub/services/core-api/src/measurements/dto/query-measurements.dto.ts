import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class QueryMeasurementsDto {
	@ApiPropertyOptional({ example: 1, default: 1 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number;

	@ApiPropertyOptional({ example: 10, default: 10 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	limit?: number;

	@ApiPropertyOptional({ example: '2026-07-01' })
	@IsOptional()
	@IsDateString()
	from?: string;

	@ApiPropertyOptional({ example: '2026-07-31' })
	@IsOptional()
	@IsDateString()
	to?: string;
}
