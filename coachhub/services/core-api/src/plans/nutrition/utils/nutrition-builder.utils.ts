import { BadRequestException } from '@nestjs/common';
import { PlannedMealFood } from '../entities/planned-meal-food.entity';
import { PlannedMeal } from '../entities/planned-meal.entity';
import { roundNutrient } from './nutrition-number.utils';

export interface NutritionNutrients {
	calories: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG: number | null;
}

export interface EffectiveNutritionTargets {
	calories: number | null;
	proteinG: number | null;
	carbsG: number | null;
	fatG: number | null;
	fiberG: number | null;
	waterMl: number | null;
}

function mapSuggestedTime(value: string | null) {
	return value?.slice(0, 5) ?? null;
}

function calculateRawPlannedFoodNutrients(
	food: Pick<
		PlannedMealFood,
		| 'amount'
		| 'servingSize'
		| 'caloriesPerServing'
		| 'proteinGPerServing'
		| 'carbsGPerServing'
		| 'fatGPerServing'
		| 'fiberGPerServing'
	>,
) {
	const multiplier = food.amount / food.servingSize;
	return {
		calories: multiplier * food.caloriesPerServing,
		proteinG: multiplier * food.proteinGPerServing,
		carbsG: multiplier * food.carbsGPerServing,
		fatG: multiplier * food.fatGPerServing,
		fiberG:
			food.fiberGPerServing === null
				? null
				: multiplier * food.fiberGPerServing,
	};
}

export function assertUniqueItemOverrideIds(
	items: { mealIngredientId: string }[],
) {
	const ids = new Set<string>();
	for (const item of items) {
		if (ids.has(item.mealIngredientId)) {
			throw new BadRequestException(
				'Each source Meal ingredient can be overridden only once',
			);
		}
		ids.add(item.mealIngredientId);
	}
}

export function assertUniquePlannedFoodIds(
	items: { plannedMealFoodId: string }[],
) {
	const ids = new Set<string>();
	for (const item of items) {
		if (ids.has(item.plannedMealFoodId)) {
			throw new BadRequestException(
				'Each planned Meal Food can appear only once',
			);
		}
		ids.add(item.plannedMealFoodId);
	}
}

export function calculatePlannedFoodNutrients(
	food: Pick<
		PlannedMealFood,
		| 'amount'
		| 'servingSize'
		| 'caloriesPerServing'
		| 'proteinGPerServing'
		| 'carbsGPerServing'
		| 'fatGPerServing'
		| 'fiberGPerServing'
	>,
): NutritionNutrients {
	const nutrients = calculateRawPlannedFoodNutrients(food);
	return {
		calories: roundNutrient(nutrients.calories),
		proteinG: roundNutrient(nutrients.proteinG),
		carbsG: roundNutrient(nutrients.carbsG),
		fatG: roundNutrient(nutrients.fatG),
		fiberG: nutrients.fiberG === null ? null : roundNutrient(nutrients.fiberG),
	};
}

export function calculatePlannedMealTotals(
	foods: Pick<
		PlannedMealFood,
		| 'amount'
		| 'servingSize'
		| 'caloriesPerServing'
		| 'proteinGPerServing'
		| 'carbsGPerServing'
		| 'fatGPerServing'
		| 'fiberGPerServing'
	>[],
): NutritionNutrients {
	const totals: NutritionNutrients = {
		calories: 0,
		proteinG: 0,
		carbsG: 0,
		fatG: 0,
		fiberG: 0,
	};

	for (const food of foods) {
		const nutrients = calculateRawPlannedFoodNutrients(food);
		totals.calories += nutrients.calories;
		totals.proteinG += nutrients.proteinG;
		totals.carbsG += nutrients.carbsG;
		totals.fatG += nutrients.fatG;
		if (totals.fiberG !== null) {
			totals.fiberG =
				nutrients.fiberG === null ? null : totals.fiberG + nutrients.fiberG;
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

export function calculatePlannedDayTotals(meals: Pick<PlannedMeal, 'foods'>[]) {
	return calculatePlannedMealTotals(meals.flatMap((meal) => meal.foods ?? []));
}

function mapNutrientVariance(target: number | null, prescribed: number | null) {
	if (target === null || prescribed === null) {
		return {
			target,
			prescribed,
			absoluteDifference: null,
			percentageDifference: null,
		};
	}

	const absoluteDifference = roundNutrient(prescribed - target);
	return {
		target,
		prescribed,
		absoluteDifference,
		percentageDifference:
			target === 0 ? null : roundNutrient((absoluteDifference / target) * 100),
	};
}

export function mapNutritionVariance(
	targets: EffectiveNutritionTargets,
	prescribed: NutritionNutrients,
) {
	return {
		calories: mapNutrientVariance(targets.calories, prescribed.calories),
		proteinG: mapNutrientVariance(targets.proteinG, prescribed.proteinG),
		carbsG: mapNutrientVariance(targets.carbsG, prescribed.carbsG),
		fatG: mapNutrientVariance(targets.fatG, prescribed.fatG),
		fiberG: mapNutrientVariance(targets.fiberG, prescribed.fiberG),
	};
}

export function mapPlannedMealResponse(meal: PlannedMeal) {
	const foods = [...(meal.foods ?? [])].sort(
		(left, right) => left.position - right.position,
	);

	return {
		id: meal.id,
		sourceMealId: meal.sourceMealId,
		mealName: meal.mealName,
		description: meal.description,
		photoUrl: meal.photoUrl,
		prepNotes: meal.prepNotes,
		dietaryTags: meal.dietaryTags,
		allergens: meal.allergens,
		slot: meal.slot,
		position: meal.position,
		suggestedTime: mapSuggestedTime(meal.suggestedTime),
		coachNotes: meal.coachNotes,
		foods: foods.map((food) => ({
			id: food.id,
			sourceFoodId: food.sourceFoodId,
			sourceMealIngredientId: food.sourceMealIngredientId,
			position: food.position,
			foodName: food.foodName,
			brand: food.brand,
			servingSize: food.servingSize,
			servingUnit: food.servingUnit,
			amount: food.amount,
			nutrientsPerServing: {
				calories: food.caloriesPerServing,
				proteinG: food.proteinGPerServing,
				carbsG: food.carbsGPerServing,
				fatG: food.fatGPerServing,
				fiberG: food.fiberGPerServing,
			},
			nutrients: calculatePlannedFoodNutrients(food),
		})),
		totals: calculatePlannedMealTotals(foods),
	};
}
