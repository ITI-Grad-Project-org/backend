import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class AcceptPlanSuggestionDto {
	@ApiPropertyOptional({
		example: '2026-09-01',
		description:
			'First day of the program. Defaults to today in the client’s own time zone.',
	})
	@IsOptional()
	@Matches(/^\d{4}-\d{2}-\d{2}$/, {
		message: 'startDate must be a calendar date in YYYY-MM-DD form',
	})
	startDate?: string;

	@ApiPropertyOptional({
		example: 'Autumn cut — block 1',
		description: 'Replaces the name the model chose.',
	})
	@IsOptional()
	@IsString()
	@MaxLength(150)
	name?: string;
}
