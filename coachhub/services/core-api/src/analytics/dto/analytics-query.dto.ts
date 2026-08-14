import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AnalyticsWindowDto {
	@ApiPropertyOptional({
		description:
			'Inclusive start of the reporting window. Defaults to 29 days before `to`.',
		example: '2026-07-16',
		format: 'date',
	})
	@IsOptional()
	@IsDateString(
		{ strict: true },
		{ message: 'from must be an ISO date (YYYY-MM-DD)' },
	)
	from?: string;

	@ApiPropertyOptional({
		description: 'Inclusive end of the reporting window. Defaults to today.',
		example: '2026-08-14',
		format: 'date',
	})
	@IsOptional()
	@IsDateString(
		{ strict: true },
		{ message: 'to must be an ISO date (YYYY-MM-DD)' },
	)
	to?: string;
}

export class AdherenceQueryDto extends AnalyticsWindowDto {
	@ApiPropertyOptional({
		description:
			'Narrow to a single client. Omit for the whole roster. The membership must ' +
			'belong to the authenticated coach — analytics scopes every query by the ' +
			'tenant taken from the token, so another tenant’s membership returns zeros.',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID('4', { message: 'membershipId must be a UUID' })
	membershipId?: string;
}
