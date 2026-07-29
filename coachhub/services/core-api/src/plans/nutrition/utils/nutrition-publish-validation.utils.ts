import { BadRequestException } from '@nestjs/common';
import { getScheduledDate } from '../../../common';
import { NutritionPlanWeek } from '../entities/nutrition-plan-week.entity';
import { NutritionPlan } from '../entities/nutrition-plan.entity';
import {
	calculatePlannedDayTotals,
	mapNutritionVariance,
} from './nutrition-builder.utils';
import { mapEffectiveDayTargets } from './nutrition-targets.utils';

export type NutritionVarianceNutrient =
	'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG';

export interface NutritionVarianceWarning {
	type: 'target_variance';
	dayId: string;
	scheduledDate: string;
	nutrient: NutritionVarianceNutrient;
	target: number;
	prescribed: number;
	absoluteDifference: number;
	percentageDifference: number | null;
}

export interface NutritionPublishValidationIssue {
	code:
		'missing_required_targets' | 'missing_planned_meal' | 'empty_planned_meal';
	message: string;
	fields?: string[];
	plannedMealIds?: string[];
}

export interface NutritionPublishValidationError {
	type: 'invalid_plan_structure' | 'invalid_week' | 'invalid_day';
	code: string;
	message: string;
	weekNumber?: number;
	dayNumber?: number;
	dayId?: string;
	scheduledDate?: string;
	issues?: NutritionPublishValidationIssue[];
}

type PublishableNutritionWeek = NutritionPlanWeek & {
	days: NutritionPlanWeek['days'];
};

const REQUIRED_TARGETS = [
	['calories', 'calories'],
	['proteinG', 'protein'],
	['carbsG', 'carbohydrates'],
	['fatG', 'fat'],
] as const;

const VARIANCE_NUTRIENTS: NutritionVarianceNutrient[] = [
	'calories',
	'proteinG',
	'carbsG',
	'fatG',
	'fiberG',
];

/**
 * A difference is warning-worthy only when it exceeds both the nutrient's
 * absolute floor and five percent of its effective target. This absorbs
 * normal serving and food-label rounding while still surfacing material gaps.
 */
export const NUTRITION_VARIANCE_WARNING_TOLERANCES: Record<
	NutritionVarianceNutrient,
	{ absolute: number; percentage: number }
> = {
	calories: { absolute: 50, percentage: 5 },
	proteinG: { absolute: 5, percentage: 5 },
	carbsG: { absolute: 5, percentage: 5 },
	fatG: { absolute: 3, percentage: 5 },
	fiberG: { absolute: 2, percentage: 5 },
};

/**
 * Validates the complete client-visible tree and creates warning-only nutrient
 * differences for normal prescribed days. Fully or partially flexible days do
 * not produce full-day variance warnings.
 */
export function validateNutritionPlanForPublishing(
	plan: NutritionPlan,
	weeks: PublishableNutritionWeek[],
) {
	const validationErrors: NutritionPublishValidationError[] = [];
	if (weeks.length !== plan.durationWeeks) {
		validationErrors.push({
			type: 'invalid_plan_structure',
			code: 'invalid_week_count',
			message: `Client nutrition plan must contain exactly ${plan.durationWeeks} weeks`,
		});
	}

	const warnings: NutritionVarianceWarning[] = [];
	const weeksByNumber = new Map(weeks.map((week) => [week.weekNumber, week]));

	for (let weekNumber = 1; weekNumber <= plan.durationWeeks; weekNumber++) {
		const week = weeksByNumber.get(weekNumber);
		if (!week) {
			validationErrors.push({
				type: 'invalid_week',
				code: 'missing_week',
				weekNumber,
				message: `Nutrition plan week ${weekNumber} is missing`,
			});
			continue;
		}
		if (week.tenantId !== plan.tenantId) {
			validationErrors.push({
				type: 'invalid_week',
				code: 'invalid_week_tenant',
				weekNumber,
				message: `Nutrition plan week ${weekNumber} is not tenant-owned`,
			});
			continue;
		}
		if ((week.days ?? []).length !== 7) {
			validationErrors.push({
				type: 'invalid_week',
				code: 'invalid_day_count',
				weekNumber,
				message: `Nutrition plan week ${weekNumber} must contain exactly 7 days`,
			});
		}

		const daysByNumber = new Map(week.days.map((day) => [day.dayNumber, day]));
		for (let dayNumber = 1; dayNumber <= 7; dayNumber++) {
			const day = daysByNumber.get(dayNumber);
			const scheduledDate = getScheduledDate(
				plan.startDate as string,
				weekNumber,
				dayNumber,
			);
			if (!day) {
				validationErrors.push({
					type: 'invalid_day',
					code: 'missing_day',
					weekNumber,
					dayNumber,
					scheduledDate,
					message: `Nutrition plan day ${scheduledDate} is missing`,
				});
				continue;
			}
			if (day.tenantId !== plan.tenantId) {
				validationErrors.push({
					type: 'invalid_day',
					code: 'invalid_day_tenant',
					weekNumber,
					dayNumber,
					dayId: day.id,
					scheduledDate,
					message: `Nutrition plan day ${scheduledDate} is not tenant-owned`,
				});
				continue;
			}

			const effectiveTargets = mapEffectiveDayTargets(plan, day);
			const missingTargets = REQUIRED_TARGETS.filter(
				([target]) => effectiveTargets[target] === null,
			).map(([, displayName]) => displayName);
			const issues: NutritionPublishValidationIssue[] = [];
			if (missingTargets.length > 0) {
				issues.push({
					code: 'missing_required_targets',
					fields: missingTargets,
					message: `Missing required targets: ${missingTargets.join(', ')}`,
				});
			}

			const meals = day.meals ?? [];
			if (!day.isFlexibleDay && meals.length === 0) {
				issues.push({
					code: 'missing_planned_meal',
					message: 'Day must be flexible or contain at least one planned Meal',
				});
			}
			const emptyMeals = meals.filter(
				(meal) => (meal.foods ?? []).length === 0,
			);
			if (emptyMeals.length > 0) {
				issues.push({
					code: 'empty_planned_meal',
					plannedMealIds: emptyMeals.map((meal) => meal.id),
					message:
						'Every planned Meal must contain at least one prescribed Food',
				});
			}
			if (issues.length > 0) {
				validationErrors.push({
					type: 'invalid_day',
					code: 'invalid_day',
					weekNumber,
					dayNumber,
					dayId: day.id,
					scheduledDate,
					message: `Nutrition plan day ${scheduledDate} is invalid`,
					issues,
				});
				continue;
			}

			// A hybrid flexible day intentionally has only a partial prescription,
			// so comparing its planned Meals with the full-day target is misleading.
			if (day.isFlexibleDay) continue;
			const prescribedTotals = calculatePlannedDayTotals(meals);
			const variance = mapNutritionVariance(effectiveTargets, prescribedTotals);
			for (const nutrient of VARIANCE_NUTRIENTS) {
				const difference = variance[nutrient];
				if (!isNutritionVarianceWarningRequired(nutrient, difference)) {
					continue;
				}
				warnings.push({
					type: 'target_variance',
					dayId: day.id,
					scheduledDate,
					nutrient,
					target: difference.target,
					prescribed: difference.prescribed,
					absoluteDifference: difference.absoluteDifference,
					percentageDifference: difference.percentageDifference,
				});
			}
		}
	}

	if (validationErrors.length > 0) {
		throw new BadRequestException({ message: validationErrors });
	}

	return warnings;
}

function isNutritionVarianceWarningRequired(
	nutrient: NutritionVarianceNutrient,
	difference: {
		target: number | null;
		prescribed: number | null;
		absoluteDifference: number | null;
		percentageDifference: number | null;
	},
) {
	if (
		difference.target === null ||
		difference.prescribed === null ||
		difference.absoluteDifference === null
	) {
		return false;
	}

	const tolerance = NUTRITION_VARIANCE_WARNING_TOLERANCES[nutrient];
	if (Math.abs(difference.absoluteDifference) <= tolerance.absolute) {
		return false;
	}
	if (
		difference.percentageDifference !== null &&
		Math.abs(difference.percentageDifference) <= tolerance.percentage
	) {
		return false;
	}
	return true;
}
