import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';

export class RescheduleClientNutritionPlanDto {
	@ApiProperty({
		example: '2026-08-01',
		format: 'date',
		description:
			'May be today or a future date in the tenant timezone. Choosing today activates the plan immediately, after which it cannot be rescheduled again.',
	})
	@IsDateString({ strict: true })
	@Matches(/^\d{4}-\d{2}-\d{2}$/, {
		message: 'startDate must use YYYY-MM-DD date-only format',
	})
	startDate: string;
}
