import { Food } from '../entities/food.entity';
import { FoodLog } from '../entities/food-log.entity';

export interface ActualNutritionTotals {
	calories: number | null;
	proteinG: number | null;
	carbsG: number | null;
	fatG: number | null;
	fiberG: number | null;
}

export interface NutritionComparisonValue {
	target: number | null;
	prescribed: number | null;
	actual: number | null;
	actualVsTarget: {
		absoluteDifference: number | null;
		percentageDifference: number | null;
	};
	actualVsPrescription: {
		absoluteDifference: number | null;
		percentageDifference: number | null;
	};
}

type FoodLogNutrients = Pick<
	FoodLog,
	'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG'
>;

type ComparableNutritionTargets = {
	calories: number | null;
	proteinG: number | null;
	carbsG: number | null;
	fatG: number | null;
	fiberG: number | null;
};

/**
 * Copies a reusable Food definition into an actual-intake snapshot. Calculated
 * values are totals for the consumed amount, so later library edits cannot
 * rewrite the client's history.
 */
export function calculateLibraryFoodLogSnapshot(
	food: Pick<
		Food,
		| 'id'
		| 'name'
		| 'brand'
		| 'servingSize'
		| 'servingUnit'
		| 'calories'
		| 'proteinG'
		| 'carbsG'
		| 'fatG'
		| 'fiberG'
	>,
	amount: number,
) {
	const multiplier = amount / food.servingSize;

	return {
		foodId: food.id,
		foodName: food.name,
		brand: food.brand,
		servingSize: food.servingSize,
		servingUnit: food.servingUnit,
		amount,
		calories: roundNutrient(food.calories * multiplier),
		proteinG: roundNutrient(food.proteinG * multiplier),
		carbsG: roundNutrient(food.carbsG * multiplier),
		fatG: roundNutrient(food.fatG * multiplier),
		fiberG:
			food.fiberG === null ? null : roundNutrient(food.fiberG * multiplier),
	};
}

/**
 * Recalculates totals from the entry's own stored snapshot when only its amount
 * changes. It deliberately does not read the current Food library row.
 */
export function recalculateLibraryFoodLogAmount(
	foodLog: Pick<
		FoodLog,
		'amount' | 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG'
	>,
	amount: number,
) {
	if (foodLog.amount === null || foodLog.amount <= 0) {
		throw new Error('A library Food snapshot needs a positive stored amount');
	}
	const multiplier = amount / foodLog.amount;
	return {
		amount,
		calories: multiplyNullableNutrient(foodLog.calories, multiplier),
		proteinG: multiplyNullableNutrient(foodLog.proteinG, multiplier),
		carbsG: multiplyNullableNutrient(foodLog.carbsG, multiplier),
		fatG: multiplyNullableNutrient(foodLog.fatG, multiplier),
		fiberG: multiplyNullableNutrient(foodLog.fiberG, multiplier),
	};
}

/**
 * Sums actual intake without treating missing diary data or unknown manual
 * nutrients as zero. Empty groups return null totals, while a missing nutrient
 * on any entry makes that nutrient's group total null.
 */
export function calculateActualNutritionTotals(
	foodLogs: FoodLogNutrients[],
): ActualNutritionTotals {
	if (foodLogs.length === 0) {
		return {
			calories: null,
			proteinG: null,
			carbsG: null,
			fatG: null,
			fiberG: null,
		};
	}

	return {
		calories: sumKnownNutrient(foodLogs, 'calories'),
		proteinG: sumKnownNutrient(foodLogs, 'proteinG'),
		carbsG: sumKnownNutrient(foodLogs, 'carbsG'),
		fatG: sumKnownNutrient(foodLogs, 'fatG'),
		fiberG: sumKnownNutrient(foodLogs, 'fiberG'),
	};
}

export function mapActualFoodLogResponse(foodLog: FoodLog) {
	return {
		id: foodLog.id,
		loggedMealId: foodLog.loggedMealId,
		foodId: foodLog.foodId,
		source: foodLog.foodId ? ('library' as const) : ('manual' as const),
		mealSlot: foodLog.mealSlot,
		foodName: foodLog.foodName,
		brand: foodLog.brand,
		servingSize: foodLog.servingSize,
		servingUnit: foodLog.servingUnit,
		amount: foodLog.amount,
		nutrients: {
			calories: foodLog.calories,
			proteinG: foodLog.proteinG,
			carbsG: foodLog.carbsG,
			fatG: foodLog.fatG,
			fiberG: foodLog.fiberG,
		},
		clientNotes: foodLog.clientNotes,
		loggedAt: foodLog.loggedAt,
		createdAt: foodLog.createdAt,
		updatedAt: foodLog.updatedAt,
	};
}

/**
 * Keeps target, prescription, and actual intake separate and supplies explicit
 * signed differences. A positive difference means actual intake was above the
 * compared value.
 */
export function mapActualNutritionComparison(
	targets: ComparableNutritionTargets,
	prescribed: ComparableNutritionTargets,
	actual: ActualNutritionTotals,
) {
	return {
		calories: mapComparisonValue(
			targets.calories,
			prescribed.calories,
			actual.calories,
		),
		proteinG: mapComparisonValue(
			targets.proteinG,
			prescribed.proteinG,
			actual.proteinG,
		),
		carbsG: mapComparisonValue(
			targets.carbsG,
			prescribed.carbsG,
			actual.carbsG,
		),
		fatG: mapComparisonValue(targets.fatG, prescribed.fatG, actual.fatG),
		fiberG: mapComparisonValue(
			targets.fiberG,
			prescribed.fiberG,
			actual.fiberG,
		),
	};
}

function sumKnownNutrient(
	foodLogs: FoodLogNutrients[],
	key: keyof FoodLogNutrients,
) {
	let total = 0;
	for (const foodLog of foodLogs) {
		const value = foodLog[key];
		if (value === null || value === undefined) return null;
		total += value;
	}
	return roundNutrient(total);
}

function mapComparisonValue(
	target: number | null,
	prescribed: number | null,
	actual: number | null,
): NutritionComparisonValue {
	return {
		target,
		prescribed,
		actual,
		actualVsTarget: calculateDifference(actual, target),
		actualVsPrescription: calculateDifference(actual, prescribed),
	};
}

function calculateDifference(actual: number | null, baseline: number | null) {
	if (actual === null || baseline === null) {
		return {
			absoluteDifference: null,
			percentageDifference: null,
		};
	}

	const absoluteDifference = roundNutrient(actual - baseline);
	return {
		absoluteDifference,
		percentageDifference:
			baseline === 0
				? null
				: roundNutrient((absoluteDifference / baseline) * 100),
	};
}

function roundNutrient(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function multiplyNullableNutrient(value: number | null, multiplier: number) {
	return value === null ? null : roundNutrient(value * multiplier);
}
