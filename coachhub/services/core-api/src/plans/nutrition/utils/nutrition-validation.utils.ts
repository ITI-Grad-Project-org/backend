import { BadRequestException } from '@nestjs/common';
import { ServingUnit } from '../../../common';

export const NUTRITION_TARGET_LIMITS = {
	calories: { min: 800, max: 6_000 },
	proteinG: { min: 1, max: 350 },
	carbsG: { min: 0, max: 800 },
	fatG: { min: 1, max: 200 },
	fiberG: { min: 0, max: 100 },
	waterMl: { min: 250, max: 6_000 },
} as const;

export const MAX_MEAL_ITEMS = 20;
export const MAX_PLANNED_MEALS_PER_DAY = 10;

export const FOOD_NUTRIENT_LIMITS = {
	calories: 2_000,
	proteinG: 150,
	carbsG: 300,
	fatG: 150,
	fiberG: 75,
} as const;

export const FOOD_REFERENCE_AMOUNT_LIMITS: Record<ServingUnit, number> = {
	[ServingUnit.G]: 500,
	[ServingUnit.ML]: 1_000,
	[ServingUnit.PIECE]: 10,
	[ServingUnit.CUP]: 4,
	[ServingUnit.TBSP]: 16,
	[ServingUnit.SCOOP]: 5,
};

export const MAX_FOOD_REFERENCE_AMOUNT = Math.max(
	...Object.values(FOOD_REFERENCE_AMOUNT_LIMITS),
);

export const MEAL_FOOD_AMOUNT_LIMITS: Record<ServingUnit, number> = {
	[ServingUnit.G]: 1_000,
	[ServingUnit.ML]: 1_500,
	[ServingUnit.PIECE]: 10,
	[ServingUnit.CUP]: 6,
	[ServingUnit.TBSP]: 32,
	[ServingUnit.SCOOP]: 8,
};

export const MAX_MEAL_FOOD_AMOUNT = Math.max(
	...Object.values(MEAL_FOOD_AMOUNT_LIMITS),
);

export type FoodDefinitionForValidation = {
	servingSize: number;
	servingUnit: ServingUnit;
	calories: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG?: number | null;
};

export type FoodNutritionWarning = {
	type: 'calorie_macro_mismatch';
	message: string;
	advisory: true;
	declaredCalories: number;
	estimatedCalories: number;
};

const CALORIES_PER_GRAM_PROTEIN = 4;
const CALORIES_PER_GRAM_CARBOHYDRATE = 4;
const CALORIES_PER_GRAM_FAT = 9;
const ESTIMATED_CALORIES_PER_GRAM_FIBER = 2;
const CALORIE_FLOOR_MINIMUM_TOLERANCE = 5;
const CALORIE_FLOOR_TOLERANCE_RATIO = 0.2;
const CALORIE_WARNING_MINIMUM_TOLERANCE = 20;
const CALORIE_WARNING_TOLERANCE_RATIO = 0.25;

function roundCalories(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Applies unit-aware limits to one reusable Food definition. DTO decorators
 * provide absolute input bounds; this check handles rules that depend on the
 * selected serving unit or on the complete state of a partial update.
 */
export function assertRealisticFoodDefinition(
	food: FoodDefinitionForValidation,
) {
	const maxServingSize = FOOD_REFERENCE_AMOUNT_LIMITS[food.servingUnit];
	if (food.servingSize > maxServingSize) {
		throw new BadRequestException(
			`servingSize cannot exceed ${maxServingSize} ${food.servingUnit}`,
		);
	}

	if (food.calories > FOOD_NUTRIENT_LIMITS.calories) {
		throw new BadRequestException(
			`calories cannot exceed ${FOOD_NUTRIENT_LIMITS.calories} per reference serving`,
		);
	}

	const nutrientLimits = [
		['proteinG', food.proteinG, FOOD_NUTRIENT_LIMITS.proteinG],
		['carbsG', food.carbsG, FOOD_NUTRIENT_LIMITS.carbsG],
		['fatG', food.fatG, FOOD_NUTRIENT_LIMITS.fatG],
		['fiberG', food.fiberG, FOOD_NUTRIENT_LIMITS.fiberG],
	] as const;
	for (const [field, value, maximum] of nutrientLimits) {
		if (value != null && value > maximum) {
			throw new BadRequestException(
				`${field} cannot exceed ${maximum} g per reference serving`,
			);
		}
	}

	if (food.servingUnit === ServingUnit.G) {
		for (const [field, value] of nutrientLimits) {
			if (value != null && value > food.servingSize) {
				throw new BadRequestException(
					`${field} is not realistic for a ${food.servingSize} g reference serving`,
				);
			}
		}

		const declaredMacronutrientMass = food.proteinG + food.carbsG + food.fatG;
		if (declaredMacronutrientMass > food.servingSize) {
			throw new BadRequestException(
				`proteinG, carbsG, and fatG together are not realistic for a ${food.servingSize} g reference serving`,
			);
		}

		const maximumCalories =
			food.servingSize * CALORIES_PER_GRAM_FAT +
			CALORIE_FLOOR_MINIMUM_TOLERANCE;
		if (food.calories > maximumCalories) {
			throw new BadRequestException(
				`calories are not realistic for a ${food.servingSize} g reference serving`,
			);
		}
	}

	const minimumCaloriesFromProteinAndFat =
		food.proteinG * CALORIES_PER_GRAM_PROTEIN +
		food.fatG * CALORIES_PER_GRAM_FAT;
	const calorieFloorTolerance = Math.max(
		CALORIE_FLOOR_MINIMUM_TOLERANCE,
		minimumCaloriesFromProteinAndFat * CALORIE_FLOOR_TOLERANCE_RATIO,
	);
	if (food.calories < minimumCaloriesFromProteinAndFat - calorieFloorTolerance) {
		throw new BadRequestException(
			'calories are too low for the declared protein and fat',
		);
	}
}

/**
 * Returns non-blocking warnings when declared calories differ substantially
 * from a broad macro-based estimate. This is advisory because fiber, sugar
 * alcohols, label rounding, and regional labeling rules can change the result.
 */
export function buildFoodNutritionWarnings(
	food: FoodDefinitionForValidation,
): FoodNutritionWarning[] {
	const fiberG = Math.min(food.fiberG ?? 0, food.carbsG);
	const digestibleCarbsG = Math.max(0, food.carbsG - fiberG);
	const estimatedCalories = roundCalories(
		food.proteinG * CALORIES_PER_GRAM_PROTEIN +
			digestibleCarbsG * CALORIES_PER_GRAM_CARBOHYDRATE +
			fiberG * ESTIMATED_CALORIES_PER_GRAM_FIBER +
			food.fatG * CALORIES_PER_GRAM_FAT,
	);
	const tolerance = Math.max(
		CALORIE_WARNING_MINIMUM_TOLERANCE,
		estimatedCalories * CALORIE_WARNING_TOLERANCE_RATIO,
	);

	if (Math.abs(food.calories - estimatedCalories) <= tolerance) return [];

	return [
		{
			type: 'calorie_macro_mismatch',
			message:
				'Declared calories differ substantially from the macro-based estimate; verify the nutrition label',
			advisory: true,
			declaredCalories: food.calories,
			estimatedCalories,
		},
	];
}

/** Adds advisory nutrition warnings without changing the stored Food entity. */
export function mapFoodWithNutritionWarnings<
	TFood extends FoodDefinitionForValidation,
>(food: TFood) {
	return {
		...food,
		nutritionWarnings: buildFoodNutritionWarnings(food),
	};
}

/** Validates a real Meal ingredient amount against its Food's serving unit. */
export function assertRealisticMealFoodAmount(
	amount: number,
	servingUnit: ServingUnit,
	field = 'amount',
) {
	const maximum = MEAL_FOOD_AMOUNT_LIMITS[servingUnit];
	if (amount > maximum) {
		throw new BadRequestException(
			`${field} cannot exceed ${maximum} ${servingUnit}`,
		);
	}
}
