import { NutritionLogStatus } from '../../../common';
import { NutritionDayLog } from '../entities/nutrition-day-log.entity';
import {
	calculateActualNutritionTotals,
	compareActualFoodLogs,
	mapActualFoodLogResponse,
} from '../utils/nutrition-food-log.utils';
import { mapPlannedMealResponse } from '../utils/nutrition-builder.utils';
import {
	isNutritionLogWindowOpen,
	mapNutritionDayLogState,
} from '../utils/nutrition-log-state.utils';

/**
 * Converts a hydrated log into the client contract. Persistence callers must
 * load Meals, planned Food snapshots, and actual Food logs before mapping.
 */
export function mapClientNutritionLog(
	log: NutritionDayLog,
	timezone: string,
	now: Date,
) {
	const state = mapNutritionDayLogState(log, log.scheduledDate, timezone, now);
	const foodLogs = [...(log.foodLogs ?? [])].sort(compareActualFoodLogs);

	return {
		id: log.id,
		nutritionPlanId: log.nutritionPlanId,
		nutritionPlanDayId: log.nutritionPlanDayId,
		scheduledDate: log.scheduledDate,
		status: log.status,
		logState: state.logState,
		adherenceOutcome: log.adherenceOutcome,
		waterMlConsumed: log.waterMlConsumed,
		clientNotes: log.clientNotes,
		startedAt: log.startedAt,
		completedAt: log.completedAt,
		isRetrospective: state.isRetrospective,
		isWritable:
			log.status === NutritionLogStatus.IN_PROGRESS &&
			isNutritionLogWindowOpen(log.scheduledDate, timezone, now),
		actualTotals: calculateActualNutritionTotals(foodLogs),
		actualFoods: foodLogs.map(mapActualFoodLogResponse),
		meals: [...(log.meals ?? [])]
			.sort((left, right) => left.position - right.position)
			.map((meal) => {
				const planned = mapPlannedMealResponse(meal.plannedMeal);
				return {
					id: meal.id,
					plannedMealId: meal.plannedMealId,
					sourceMealId: meal.sourceMealId,
					mealName: meal.mealName,
					slot: meal.slot,
					position: meal.position,
					prescribedTotals: {
						calories: meal.prescribedCalories,
						proteinG: meal.prescribedProteinG,
						carbsG: meal.prescribedCarbsG,
						fatG: meal.prescribedFatG,
						fiberG: meal.prescribedFiberG,
					},
					outcome: meal.outcome,
					clientNotes: meal.clientNotes,
					actualTotals: calculateActualNutritionTotals(
						foodLogs.filter((foodLog) => foodLog.loggedMealId === meal.id),
					),
					plannedFoods: planned.foods,
				};
			}),
	};
}
