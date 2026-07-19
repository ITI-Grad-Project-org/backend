import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';

export class RescheduleClientProgramDto {
	@ApiProperty({ example: '2026-08-01', format: 'date' })
	@IsDateString({ strict: true })
	@Matches(/^\d{4}-\d{2}-\d{2}$/, {
		message: 'startDate must use YYYY-MM-DD date-only format',
	})
	startDate: string;
}
