import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SetNutritionTargetDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	membershipId: string;

	@ApiProperty({ example: 2200 })
	@IsInt()
	@Min(0)
	calories: number;

	@ApiProperty({ example: 180 })
	@IsInt()
	@Min(0)
	proteinG: number;

	@ApiProperty({ example: 200 })
	@IsInt()
	@Min(0)
	carbsG: number;

	@ApiProperty({ example: 70 })
	@IsInt()
	@Min(0)
	fatG: number;

	@ApiPropertyOptional({ example: 3000 })
	@IsOptional()
	@IsInt()
	@Min(0)
	waterMl?: number;

	@ApiPropertyOptional({ example: '2026-07-07', default: 'today' })
	@IsOptional()
	@IsDateString()
	effectiveFrom?: string;
}
