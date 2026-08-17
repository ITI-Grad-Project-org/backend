import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Longest decline reason kept. It is prose for a human, not a field to query. */
export const MAX_DECLINE_REASON_LENGTH = 1_000;

export class DeclinePlanSuggestionDto {
	@ApiPropertyOptional({
		example: 'Too much pressing volume for a shoulder that is still settling.',
		description:
			'Why this was turned down. Optional, but it is the natural seed for a ' +
			'regenerated request, so it is worth asking for.',
	})
	@IsOptional()
	@IsString()
	@MaxLength(MAX_DECLINE_REASON_LENGTH)
	reason?: string;
}
