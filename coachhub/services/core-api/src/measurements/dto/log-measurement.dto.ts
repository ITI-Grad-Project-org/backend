import {
	IsArray,
	IsDateString,
	IsNumber,
	IsOptional,
	IsUrl,
	IsUUID,
	Max,
	Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One check-in row → `measurements`; at least weight is usually sent. */
export class LogMeasurementDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	membershipId: string;

	@ApiPropertyOptional({ example: '2026-07-03', default: 'today' })
	@IsOptional()
	@IsDateString()
	measuredAt?: string;

	@ApiPropertyOptional({ example: 82.5 })
	@IsOptional()
	@IsNumber()
	@Min(20)
	@Max(500)
	weightKg?: number;

	@ApiPropertyOptional({ example: 18.5 })
	@IsOptional()
	@IsNumber()
	@Min(1)
	@Max(80)
	bodyFatPct?: number;

	@ApiPropertyOptional({ example: 102 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	chestCm?: number;

	@ApiPropertyOptional({ example: 84 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	waistCm?: number;

	@ApiPropertyOptional({ example: 98 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	hipsCm?: number;

	@ApiPropertyOptional({ example: 36 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	armCm?: number;

	@ApiPropertyOptional({ example: 58 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	thighCm?: number;

	@ApiPropertyOptional({ type: [String], description: 'Progress photo URLs' })
	@IsOptional()
	@IsArray()
	@IsUrl({}, { each: true })
	photos?: string[];
}
