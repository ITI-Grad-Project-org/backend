import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { getScheduledDate } from '../../../common';
import { NutritionPlanDay } from '../entities/nutrition-plan-day.entity';
import { NutritionPlan } from '../entities/nutrition-plan.entity';
import {
	buildDietaryAdvisoryWarnings,
	ClientDietaryProfile,
	getDietaryAdvisoryNotice,
	mapClientDietaryProfile,
} from '../utils/nutrition-dietary-advisory.utils';
import {
	calculatePlannedDayTotals,
	mapNutritionVariance,
	mapPlannedMealResponse,
} from '../utils/nutrition-builder.utils';
import { deriveNutritionPlanSchedulePhase } from '../utils/client-nutrition-plan.utils';
import {
	mapDayTargetOverrides,
	mapEffectiveDayTargets,
	mapPlanTargets,
} from '../utils/nutrition-targets.utils';

function mapMembershipSummary(membership: ClientMembership | null) {
	if (!membership) return null;
	return {
		id: membership.id,
		status: membership.status,
		client: membership.client
			? {
					id: membership.client.id,
					firstName: membership.client.firstName,
					lastName: membership.client.lastName,
					email: membership.client.email,
					avatarUrl: membership.client.avatarUrl,
				}
			: null,
	};
}

export function mapClientNutritionPlanSummary(
	plan: NutritionPlan,
	timezone: string,
	now = new Date(),
) {
	return {
		id: plan.id,
		membershipId: plan.membershipId,
		membership: mapMembershipSummary(plan.membership),
		name: plan.name,
		description: plan.description,
		goal: plan.goal,
		durationWeeks: plan.durationWeeks,
		startDate: plan.startDate,
		endDate: plan.endDate,
		targets: mapPlanTargets(plan),
		status: plan.status,
		schedulePhase: deriveNutritionPlanSchedulePhase(plan, timezone, now),
		isArchived: plan.isArchived,
		createdAt: plan.createdAt,
		updatedAt: plan.updatedAt,
	};
}

export function mapClientNutritionPlanBuilder(
	plan: NutritionPlan,
	timezone: string,
	dietaryProfile: ClientDietaryProfile = null,
	now = new Date(),
) {
	const weeks = [...(plan.weeks ?? [])].sort(
		(left, right) => left.weekNumber - right.weekNumber,
	);
	const mappedWeeks = weeks.map((week) => {
		const days = [...(week.days ?? [])].sort(
			(left, right) => left.dayNumber - right.dayNumber,
		);
		return {
			id: week.id,
			weekNumber: week.weekNumber,
			notes: week.notes,
			days: days.map((day) =>
				mapClientNutritionDay(plan, week.weekNumber, day, dietaryProfile),
			),
		};
	});

	return {
		...mapClientNutritionPlanSummary(plan, timezone, now),
		clientDietaryProfile: mapClientDietaryProfile(dietaryProfile),
		dietaryAdvisoryNotice: getDietaryAdvisoryNotice(),
		warnings: mappedWeeks.flatMap((week) =>
			week.days.flatMap((day) => day.warnings),
		),
		weeks: mappedWeeks,
	};
}

export function mapClientNutritionDay(
	plan: NutritionPlan,
	weekNumber: number,
	day: NutritionPlanDay,
	dietaryProfile: ClientDietaryProfile = null,
) {
	const scheduledDate = getScheduledDate(
		plan.startDate as string,
		weekNumber,
		day.dayNumber,
	);
	const meals = [...(day.meals ?? [])].sort(
		(left, right) => left.position - right.position,
	);
	const effectiveTargets = mapEffectiveDayTargets(plan, day);
	const prescribedTotals = calculatePlannedDayTotals(meals);
	const warnings = buildDietaryAdvisoryWarnings(
		day.id,
		scheduledDate,
		meals,
		dietaryProfile,
	);

	return {
		id: day.id,
		dayNumber: day.dayNumber,
		scheduledDate,
		isFlexibleDay: day.isFlexibleDay,
		targetOverrides: mapDayTargetOverrides(day),
		effectiveTargets,
		prescribedTotals,
		variance: mapNutritionVariance(effectiveTargets, prescribedTotals),
		notes: day.notes,
		warnings,
		meals: meals.map(mapPlannedMealResponse),
	};
}

export function omitCoachPlanFields<T extends { isArchived: boolean }>(
	plan: T,
): Omit<T, 'isArchived'> {
	const { isArchived: _isArchived, ...clientPlan } = plan;
	return clientPlan;
}
