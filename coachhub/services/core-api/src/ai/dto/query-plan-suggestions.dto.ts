import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PlanSuggestionKind, PlanSuggestionStatus } from '../../common';

/** Ceiling on one page. A suggestion carries a snapshot; a thousand is not a page. */
export const MAX_PLAN_SUGGESTION_PAGE_SIZE = 100;

export class QueryPlanSuggestionsDto {
	@ApiPropertyOptional({
		description: 'Restrict to one client. Omit to list the whole tenant.',
	})
	@IsOptional()
	@IsUUID()
	membershipId?: string;

	@ApiPropertyOptional({ enum: PlanSuggestionKind })
	@IsOptional()
	@IsEnum(PlanSuggestionKind)
	kind?: PlanSuggestionKind;

	// Single-valued on purpose. The question a coach actually asks is "what is
	// waiting for me?" — one status at a time answers it, and a multi-select would
	// buy an OR clause that no screen has asked for yet.
	@ApiPropertyOptional({ enum: PlanSuggestionStatus })
	@IsOptional()
	@IsEnum(PlanSuggestionStatus)
	status?: PlanSuggestionStatus;

	@ApiPropertyOptional({ example: 1, default: 1 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number;

	@ApiPropertyOptional({
		example: 10,
		default: 10,
		maximum: MAX_PLAN_SUGGESTION_PAGE_SIZE,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(MAX_PLAN_SUGGESTION_PAGE_SIZE)
	limit?: number;
}
