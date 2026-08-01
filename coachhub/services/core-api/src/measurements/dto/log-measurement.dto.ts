import {
	IsDateString,
	IsNumber,
	IsOptional,
	IsUUID,
	Max,
	Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Sent as multipart form-data (progress photos ride along as files), so every
// numeric field is coerced from its string form before validation.
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
	@Type(() => Number)
	@IsNumber()
	@Min(20)
	@Max(500)
	weightKg?: number;

	@ApiPropertyOptional({ example: 18.5 })
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(1)
	@Max(80)
	bodyFatPct?: number;

	@ApiPropertyOptional({ example: 102 })
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	chestCm?: number;

	@ApiPropertyOptional({ example: 84 })
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	waistCm?: number;

	@ApiPropertyOptional({ example: 98 })
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	hipsCm?: number;

	@ApiPropertyOptional({ example: 36 })
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	armCm?: number;

	@ApiPropertyOptional({ example: 58 })
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	thighCm?: number;

	// Progress photos are uploaded as `photos` file parts, not URLs. Sending any
	// on update replaces the stored set.
}
