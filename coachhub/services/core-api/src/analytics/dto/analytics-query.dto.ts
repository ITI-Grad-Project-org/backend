import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsDateString,
	IsInt,
	IsOptional,
	IsUUID,
	Max,
	Min,
} from 'class-validator';

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

export class ActivityQueryDto extends AnalyticsWindowDto {
	@ApiPropertyOptional({
		description:
			'Maximum rows to return. Defaults to 50; anything outside 1–200 is rejected ' +
			'here rather than silently clamped, so a caller asking for 5000 learns the ' +
			'page is bounded instead of assuming it received everything. Analytics also ' +
			'caps at 200 independently, which protects it from callers that are not this API.',
		minimum: 1,
		maximum: 200,
		default: 50,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt({ message: 'limit must be an integer' })
	@Min(1, { message: 'limit must be at least 1' })
	@Max(200, { message: 'limit must not exceed 200' })
	limit?: number;
}

export class AttentionQueryDto {
	@ApiPropertyOptional({
		description:
			'Measure urgency from this date instead of today. Useful for reproducing ' +
			'what the queue looked like on a past day.',
		example: '2026-08-14',
		format: 'date',
	})
	@IsOptional()
	@IsDateString(
		{ strict: true },
		{ message: 'asOf must be an ISO date (YYYY-MM-DD)' },
	)
	asOf?: string;

	@ApiPropertyOptional({
		description:
			'Days of silence before an active client is listed. Silence is measured ' +
			'from their last logged activity of any kind, or from their join date if ' +
			'they have never logged anything.',
		minimum: 1,
		default: 7,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt({ message: 'riskThresholdDays must be an integer' })
	@Min(1, { message: 'riskThresholdDays must be at least 1' })
	riskThresholdDays?: number;

	@ApiPropertyOptional({
		description: 'How many days ahead to report programmes that are ending.',
		minimum: 1,
		default: 14,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt({ message: 'endingHorizonDays must be an integer' })
	@Min(1, { message: 'endingHorizonDays must be at least 1' })
	endingHorizonDays?: number;
}
