import { NutritionPlanDay } from '../entities/nutrition-plan-day.entity';
import { NutritionPlan } from '../entities/nutrition-plan.entity';

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

/**
 * Builds the real targets for a date. A non-null day override wins;
 * otherwise the plan-level target remains in effect.
 */
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
