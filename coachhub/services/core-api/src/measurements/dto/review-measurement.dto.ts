import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewMeasurementDto {
	@ApiPropertyOptional({
		example: 'Good progress. Keep following the current plan.',
		maxLength: 5000,
		nullable: true,
	})
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	coachFeedback?: string | null;
}
