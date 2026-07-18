import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';

export class ClientTrainingCalendarQueryDto {
	@ApiProperty({ example: '2026-07-01', format: 'date' })
	@IsDateString({ strict: true })
	@Matches(/^\d{4}-\d{2}-\d{2}$/, {
		message: 'from must use YYYY-MM-DD date-only format',
	})
	from: string;

	@ApiProperty({ example: '2026-07-31', format: 'date' })
	@IsDateString({ strict: true })
	@Matches(/^\d{4}-\d{2}-\d{2}$/, {
		message: 'to must use YYYY-MM-DD date-only format',
	})
	to: string;
}
