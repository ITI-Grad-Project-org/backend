import { BadRequestException } from '@nestjs/common';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import {
	getDateOnlyInTimeZone,
	getScheduledDate,
	isValidDateOnly,
	NutritionPlanStatus,
} from '../../../common';
import { NutritionPlanDay } from '../entities/nutrition-plan-day.entity';
import { NutritionPlan } from '../entities/nutrition-plan.entity';
import {
	buildDietaryAdvisoryWarnings,
	calculatePlannedDayTotals,
	ClientDietaryProfile,
	getDietaryAdvisoryNotice,
	mapClientDietaryProfile,
	mapNutritionVariance,
	mapPlannedMealResponse,
} from './nutrition-builder.utils';

export type NutritionPlanSchedulePhase = 'scheduled' | 'active' | 'ended';

export function assertNutritionTenant(tenantId: string | null) {
	if (!tenantId) {
		throw new BadRequestException('No active tenant selected');
	}
	return tenantId;
}

export function assertNutritionStartDate(
	startDate: string,
	timezone: string,
	now = new Date(),
) {
	if (!isValidDateOnly(startDate)) {
		throw new BadRequestException('startDate must be a valid date');
	}

	const today = getDateOnlyInTimeZone(now, timezone);
	if (startDate < today) {
		throw new BadRequestException(
			'startDate cannot be before today in the tenant timezone',
		);
	}
}

export function normalizeNutritionPlanText(value?: string | null) {
	if (value == null) return null;
	const normalized = value.trim();
	return normalized || null;
}

export function mapPlanTargets(
	plan: Pick<
		NutritionPlan,
		| 'targetCalories'
		| 'targetProteinG'
		| 'targetCarbsG'
		| 'targetFatG'
		| 'targetFiberG'
		| 'targetWaterMl'
	>,
) {
	return {
		calories: plan.targetCalories,
		proteinG: plan.targetProteinG,
		carbsG: plan.targetCarbsG,
		fatG: plan.targetFatG,
		fiberG: plan.targetFiberG,
		waterMl: plan.targetWaterMl,
	};
}

export function mapDayTargetOverrides(
	day: Pick<
		NutritionPlanDay,
		| 'targetCaloriesOverride'
		| 'targetProteinGOverride'
		| 'targetCarbsGOverride'
		| 'targetFatGOverride'
		| 'targetFiberGOverride'
		| 'targetWaterMlOverride'
	>,
) {
	return {
		calories: day.targetCaloriesOverride,
		proteinG: day.targetProteinGOverride,
		carbsG: day.targetCarbsGOverride,
		fatG: day.targetFatGOverride,
		fiberG: day.targetFiberGOverride,
		waterMl: day.targetWaterMlOverride,
	};
}

export function mapEffectiveDayTargets(
	plan: Parameters<typeof mapPlanTargets>[0],
	day: Parameters<typeof mapDayTargetOverrides>[0],
) {
	const defaults = mapPlanTargets(plan);
	const overrides = mapDayTargetOverrides(day);
	return {
		calories: overrides.calories ?? defaults.calories,
		proteinG: overrides.proteinG ?? defaults.proteinG,
		carbsG: overrides.carbsG ?? defaults.carbsG,
		fatG: overrides.fatG ?? defaults.fatG,
		fiberG: overrides.fiberG ?? defaults.fiberG,
		waterMl: overrides.waterMl ?? defaults.waterMl,
	};
}

export function deriveNutritionPlanSchedulePhase(
	plan: Pick<NutritionPlan, 'status' | 'startDate' | 'endDate'>,
	timezone: string,
	now = new Date(),
): NutritionPlanSchedulePhase | null {
	if (
		plan.status !== NutritionPlanStatus.PUBLISHED ||
		!plan.startDate ||
		!plan.endDate
	) {
		return null;
	}

	const today = getDateOnlyInTimeZone(now, timezone);
	if (today < plan.startDate) return 'scheduled';
	if (today > plan.endDate) return 'ended';
	return 'active';
}

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
