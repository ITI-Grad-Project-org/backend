import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { FitnessGoal, PlanSuggestionKind } from '../../common';

/** Longest free-text steer a coach may attach to one request. */
export const MAX_COACH_NOTES_LENGTH = 2_000;

/**
 * Asking for a plan takes almost nothing: the client id is the request, because
 * everything the model needs is already on file. Every other field is an
 * override of what the intake already says.
 */
export class CreatePlanSuggestionDto {
	@ApiProperty({ description: 'The client to design for.' })
	@IsUUID()
	membershipId: string;

	@ApiProperty({ enum: PlanSuggestionKind })
	@IsEnum(PlanSuggestionKind)
	kind: PlanSuggestionKind;

	// 1–52 is not a taste call: `ck_programs_duration_weeks` and
	// `ck_nutrition_plans_duration_weeks` both reject anything outside it, so a
	// wider range here would only produce plans that cannot be accepted.
	@ApiPropertyOptional({ minimum: 1, maximum: 52, default: 4 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(52)
	durationWeeks?: number;

	@ApiPropertyOptional({
		minimum: 1,
		maximum: 7,
		description:
			'Training only. Defaults to the intake’s trainingDaysPerWeek, then 3.',
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(7)
	daysPerWeek?: number;

	@ApiPropertyOptional({
		enum: FitnessGoal,
		description: 'Overrides the intake goal for this plan only.',
	})
	@IsOptional()
	@IsEnum(FitnessGoal)
	goal?: FitnessGoal;

	@ApiPropertyOptional({
		example: 'Shoulder still recovering — keep overhead pressing light.',
	})
	@IsOptional()
	@IsString()
	@MaxLength(MAX_COACH_NOTES_LENGTH)
	coachNotes?: string;
}
