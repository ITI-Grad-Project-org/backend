import { ApiProperty } from '@nestjs/swagger';
import {
	FitnessGoal,
	NutritionAdherenceOutcome,
	NutritionLogStatus,
	NutritionPlanStatus,
} from '../../../common';
import {
	ClientNutritionNutrientsResponseDto,
	ClientNutritionMembershipResponseDto,
	ClientNutritionTargetsResponseDto,
} from './client-nutrition-response.dto';
import { ActualNutritionTotalsResponseDto } from './nutrition-logging.dto';

export class CoachNutritionReviewPlanResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	membershipId: string;

	@ApiProperty({
		type: () => ClientNutritionMembershipResponseDto,
		nullable: true,
	})
	membership: ClientNutritionMembershipResponseDto | null;

	@ApiProperty()
	name: string;

	@ApiProperty({ nullable: true })
	description: string | null;

	@ApiProperty({ enum: FitnessGoal, nullable: true })
	goal: FitnessGoal | null;

	@ApiProperty({ format: 'date' })
	startDate: string;

	@ApiProperty({ format: 'date' })
	endDate: string;

	@ApiProperty({ enum: NutritionPlanStatus })
	status: NutritionPlanStatus;

	@ApiProperty({ enum: ['scheduled', 'active', 'ended'], nullable: true })
	schedulePhase: 'scheduled' | 'active' | 'ended' | null;

	@ApiProperty()
	isArchived: boolean;
}

export class CoachNutritionDifferenceResponseDto {
	@ApiProperty({ nullable: true })
	absoluteDifference: number | null;

	@ApiProperty({ nullable: true })
	percentageDifference: number | null;
}

export class CoachNutritionComparisonValueResponseDto {
	@ApiProperty({ nullable: true })
	target: number | null;

	@ApiProperty({ nullable: true })
	prescribed: number | null;

	@ApiProperty({ nullable: true })
	actual: number | null;

	@ApiProperty({ type: () => CoachNutritionDifferenceResponseDto })
	actualVsTarget: CoachNutritionDifferenceResponseDto;

	@ApiProperty({ type: () => CoachNutritionDifferenceResponseDto })
	actualVsPrescription: CoachNutritionDifferenceResponseDto;
}

export class CoachNutritionComparisonResponseDto {
	@ApiProperty({ type: () => CoachNutritionComparisonValueResponseDto })
	calories: CoachNutritionComparisonValueResponseDto;

	@ApiProperty({ type: () => CoachNutritionComparisonValueResponseDto })
	proteinG: CoachNutritionComparisonValueResponseDto;

	@ApiProperty({ type: () => CoachNutritionComparisonValueResponseDto })
	carbsG: CoachNutritionComparisonValueResponseDto;

	@ApiProperty({ type: () => CoachNutritionComparisonValueResponseDto })
	fatG: CoachNutritionComparisonValueResponseDto;

	@ApiProperty({ type: () => CoachNutritionComparisonValueResponseDto })
	fiberG: CoachNutritionComparisonValueResponseDto;
}

export class CoachNutritionMealOutcomeSummaryResponseDto {
	@ApiProperty({ format: 'uuid' })
	loggedMealId: string;

	@ApiProperty({ format: 'uuid' })
	plannedMealId: string;

	@ApiProperty()
	mealName: string;

	@ApiProperty({ enum: NutritionAdherenceOutcome })
	outcome: NutritionAdherenceOutcome;
}

export class CoachNutritionLogSummaryResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	nutritionPlanDayId: string;

	@ApiProperty({ format: 'date' })
	scheduledDate: string;

	@ApiProperty({ enum: NutritionLogStatus })
	status: NutritionLogStatus;

	@ApiProperty({
		enum: [
			'in_progress',
			'incomplete',
			'completed',
			'partial',
			'skipped',
			'not_applicable',
		],
	})
	logState: string;

	@ApiProperty({ enum: NutritionAdherenceOutcome, nullable: true })
	adherenceOutcome: NutritionAdherenceOutcome | null;

	@ApiProperty({ type: () => ClientNutritionTargetsResponseDto })
	effectiveTargets: ClientNutritionTargetsResponseDto;

	@ApiProperty({ type: () => ClientNutritionNutrientsResponseDto })
	prescribedTotals: ClientNutritionNutrientsResponseDto;

	@ApiProperty({ type: () => ActualNutritionTotalsResponseDto })
	actualTotals: ActualNutritionTotalsResponseDto;

	@ApiProperty({ example: 3 })
	actualFoodCount: number;

	@ApiProperty({ type: () => CoachNutritionComparisonResponseDto })
	comparisons: CoachNutritionComparisonResponseDto;

	@ApiProperty({
		type: () => CoachNutritionMealOutcomeSummaryResponseDto,
		isArray: true,
	})
	mealOutcomes: CoachNutritionMealOutcomeSummaryResponseDto[];

	@ApiProperty({ nullable: true })
	waterMlConsumed: number | null;

	@ApiProperty({ nullable: true })
	clientNotes: string | null;

	@ApiProperty()
	isRetrospective: boolean;

	@ApiProperty({ format: 'date-time' })
	startedAt: Date;

	@ApiProperty({ format: 'date-time', nullable: true })
	completedAt: Date | null;

	@ApiProperty({ format: 'date-time' })
	updatedAt: Date;
}

export class CoachNutritionPlanLogsResponseDto {
	@ApiProperty({ type: () => CoachNutritionReviewPlanResponseDto })
	plan: CoachNutritionReviewPlanResponseDto;

	@ApiProperty({
		type: () => CoachNutritionLogSummaryResponseDto,
		isArray: true,
	})
	logs: CoachNutritionLogSummaryResponseDto[];
}

export class CoachNutritionDayReviewResponseDto {
	@ApiProperty({ type: () => CoachNutritionReviewPlanResponseDto })
	plan: CoachNutritionReviewPlanResponseDto;

	@ApiProperty({ format: 'date' })
	scheduledDate: string;

	@ApiProperty({
		type: Object,
		description:
			'Effective targets plus immutable planned Meal and Food snapshots.',
	})
	prescription: object;

	@ApiProperty({
		type: Object,
		nullable: true,
		description:
			'Client-reported Meal outcomes, water, notes, state, and timestamps.',
	})
	reportedAdherence: object | null;

	@ApiProperty({
		type: Object,
		nullable: true,
		description:
			'Linked and unplanned actual Food snapshots with Meal and day totals.',
	})
	actualIntake: object | null;

	@ApiProperty({
		type: () => CoachNutritionComparisonResponseDto,
		nullable: true,
	})
	comparisons: CoachNutritionComparisonResponseDto | null;
}
