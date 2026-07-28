import { NutritionDayLog } from '../entities/nutrition-day-log.entity';
import { NutritionPlan } from '../entities/nutrition-plan.entity';
import {
	calculateActualNutritionTotals,
	compareActualFoodLogs,
	mapActualFoodLogResponse,
	mapActualNutritionComparison,
} from '../utils/nutrition-food-log.utils';
import { deriveNutritionPlanSchedulePhase } from '../utils/client-nutrition-plan.utils';
import { mapNutritionDayLogState } from '../utils/nutrition-log-state.utils';
import { roundNutrient } from '../utils/nutrition-number.utils';
import { mapEffectiveDayTargets } from '../utils/nutrition-targets.utils';

export function mapReviewPlan(plan: NutritionPlan, now: Date) {
	return {
		id: plan.id,
		membershipId: plan.membershipId,
		membership: plan.membership
			? {
					id: plan.membership.id,
					status: plan.membership.status,
					client: plan.membership.client
						? {
								id: plan.membership.client.id,
								firstName: plan.membership.client.firstName,
								lastName: plan.membership.client.lastName,
								email: plan.membership.client.email,
								avatarUrl: plan.membership.client.avatarUrl,
							}
						: null,
				}
			: null,
		name: plan.name,
		description: plan.description,
		goal: plan.goal,
		startDate: plan.startDate,
		endDate: plan.endDate,
		status: plan.status,
		schedulePhase: deriveNutritionPlanSchedulePhase(
			plan,
			plan.tenant.timezone,
			now,
		),
		isArchived: plan.isArchived,
	};
}

export function mapReviewLogSummary(
	log: NutritionDayLog,
	plan: NutritionPlan,
	now: Date,
) {
	const prescribedTotals = calculateLoggedMealPrescriptionTotals(log);
	const actualTotals = calculateActualNutritionTotals(log.foodLogs ?? []);
	const effectiveTargets = mapEffectiveDayTargets(plan, log.nutritionPlanDay);
	const state = mapNutritionDayLogState(
		log,
		log.scheduledDate,
		plan.tenant.timezone,
		now,
	);

	return {
		id: log.id,
		nutritionPlanDayId: log.nutritionPlanDayId,
		scheduledDate: log.scheduledDate,
		status: log.status,
		logState: state.logState,
		adherenceOutcome: log.adherenceOutcome,
		effectiveTargets,
		prescribedTotals,
		actualTotals,
		actualFoodCount: (log.foodLogs ?? []).length,
		comparisons: mapActualNutritionComparison(
			effectiveTargets,
			prescribedTotals,
			actualTotals,
		),
		mealOutcomes: [...(log.meals ?? [])]
			.sort((left, right) => left.position - right.position)
			.map((meal) => ({
				loggedMealId: meal.id,
				plannedMealId: meal.plannedMealId,
				mealName: meal.mealName,
				outcome: meal.outcome,
			})),
		waterMlConsumed: log.waterMlConsumed,
		clientNotes: log.clientNotes,
		isRetrospective: state.isRetrospective,
		startedAt: log.startedAt,
		completedAt: log.completedAt,
		updatedAt: log.updatedAt,
	};
}

export function mapReportedAdherence(
	log: NutritionDayLog,
	timezone: string,
	now: Date,
) {
	const state = mapNutritionDayLogState(log, log.scheduledDate, timezone, now);
	return {
		logId: log.id,
		status: log.status,
		logState: state.logState,
		adherenceOutcome: log.adherenceOutcome,
		waterMlConsumed: log.waterMlConsumed,
		clientNotes: log.clientNotes,
		meals: [...(log.meals ?? [])]
			.sort((left, right) => left.position - right.position)
			.map((meal) => ({
				loggedMealId: meal.id,
				plannedMealId: meal.plannedMealId,
				mealName: meal.mealName,
				slot: meal.slot,
				position: meal.position,
				outcome: meal.outcome,
				clientNotes: meal.clientNotes,
			})),
		startedAt: log.startedAt,
		completedAt: log.completedAt,
		updatedAt: log.updatedAt,
		isRetrospective: state.isRetrospective,
	};
}

export function mapActualIntake(log: NutritionDayLog) {
	const foodLogs = [...(log.foodLogs ?? [])].sort(compareActualFoodLogs);
	const meals = [...(log.meals ?? [])]
		.sort((left, right) => left.position - right.position)
		.map((meal) => {
			const linkedFoods = foodLogs.filter(
				(foodLog) => foodLog.loggedMealId === meal.id,
			);
			return {
				loggedMealId: meal.id,
				plannedMealId: meal.plannedMealId,
				mealName: meal.mealName,
				slot: meal.slot,
				actualTotals: calculateActualNutritionTotals(linkedFoods),
				foods: linkedFoods.map(mapActualFoodLogResponse),
			};
		});

	return {
		actualTotals: calculateActualNutritionTotals(foodLogs),
		meals,
		unplannedFoods: foodLogs
			.filter((foodLog) => foodLog.loggedMealId === null)
			.map(mapActualFoodLogResponse),
	};
}

function calculateLoggedMealPrescriptionTotals(log: NutritionDayLog) {
	const totals = {
		calories: 0,
		proteinG: 0,
		carbsG: 0,
		fatG: 0,
		fiberG: 0 as number | null,
	};
	for (const meal of log.meals ?? []) {
		totals.calories += meal.prescribedCalories;
		totals.proteinG += meal.prescribedProteinG;
		totals.carbsG += meal.prescribedCarbsG;
		totals.fatG += meal.prescribedFatG;
		if (totals.fiberG !== null) {
			totals.fiberG =
				meal.prescribedFiberG === null
					? null
					: totals.fiberG + meal.prescribedFiberG;
		}
	}
	return {
		calories: roundNutrient(totals.calories),
		proteinG: roundNutrient(totals.proteinG),
		carbsG: roundNutrient(totals.carbsG),
		fatG: roundNutrient(totals.fatG),
		fiberG: totals.fiberG === null ? null : roundNutrient(totals.fiberG),
	};
}
