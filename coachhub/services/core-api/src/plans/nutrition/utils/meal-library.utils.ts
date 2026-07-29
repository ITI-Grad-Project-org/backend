import { BadRequestException } from '@nestjs/common';
import { DietaryPreference } from '../../../common';
import { MealItemDto } from '../dto/create-meal.dto';
import { Food } from '../entities/food.entity';
import { MealIngredient } from '../entities/meal-ingredient.entity';
import { Meal } from '../entities/meal.entity';
import {
	normalizeFoodAllergens,
	normalizeFoodDietaryTags,
	normalizeFoodDisplayText,
} from './food-library.utils';
import { roundNutrient } from './nutrition-number.utils';

export interface CalculatedNutrients {
	calories: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG: number | null;
}

interface RawNutrients {
	calories: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG: number | null;
}

export function normalizeMealName(value: string) {
	return normalizeFoodDisplayText(value);
}

export function normalizeNullableMealText(value?: string | null) {
	if (value === undefined || value === null) return null;
	const normalized = value.trim();
	return normalized || null;
}

export function normalizeMealDietaryTags(tags?: DietaryPreference[]) {
	return normalizeFoodDietaryTags(tags);
}

export function normalizeMealAllergens(allergens?: string[]) {
	return normalizeFoodAllergens(allergens);
}

export function assertUniqueMealFoods(items: MealItemDto[]) {
	const foodIds = new Set<string>();
	for (const item of items) {
		if (foodIds.has(item.foodId)) {
			throw new BadRequestException(
				'A Food can appear only once in a Meal; combine duplicate amounts',
			);
		}
		foodIds.add(item.foodId);
	}
}

function calculateRawFoodNutrients(food: Food, amount: number): RawNutrients {
	return {
		calories: (amount * food.calories) / food.servingSize,
		proteinG: (amount * food.proteinG) / food.servingSize,
		carbsG: (amount * food.carbsG) / food.servingSize,
		fatG: (amount * food.fatG) / food.servingSize,
		fiberG:
			food.fiberG === null ? null : (amount * food.fiberG) / food.servingSize,
	};
}

function roundNutrients(nutrients: RawNutrients): CalculatedNutrients {
	return {
		calories: roundNutrient(nutrients.calories),
		proteinG: roundNutrient(nutrients.proteinG),
		carbsG: roundNutrient(nutrients.carbsG),
		fatG: roundNutrient(nutrients.fatG),
		fiberG: nutrients.fiberG === null ? null : roundNutrient(nutrients.fiberG),
	};
}

export function calculateFoodNutrients(food: Food, amount: number) {
	return roundNutrients(calculateRawFoodNutrients(food, amount));
}

export function calculateMealTotals(
	ingredients: Pick<MealIngredient, 'amount' | 'food'>[],
): CalculatedNutrients {
	const totals: RawNutrients = {
		calories: 0,
		proteinG: 0,
		carbsG: 0,
		fatG: 0,
		fiberG: 0,
	};

	for (const ingredient of ingredients) {
		const nutrients = calculateRawFoodNutrients(
			ingredient.food,
			ingredient.amount,
		);
		totals.calories += nutrients.calories;
		totals.proteinG += nutrients.proteinG;
		totals.carbsG += nutrients.carbsG;
		totals.fatG += nutrients.fatG;
		if (totals.fiberG !== null) {
			totals.fiberG =
				nutrients.fiberG === null ? null : totals.fiberG + nutrients.fiberG;
		}
	}

	return roundNutrients(totals);
}

export function mapMealResponse(meal: Meal) {
	const ingredients = [...(meal.ingredients ?? [])].sort(
		(left, right) => left.position - right.position,
	);
	const additionalAllergens = normalizeMealAllergens(meal.allergens);
	const effectiveAllergens = normalizeMealAllergens([
		...additionalAllergens,
		...ingredients.flatMap((ingredient) => ingredient.food.allergens ?? []),
	]);

	return {
		id: meal.id,
		name: meal.name,
		description: meal.description,
		photoUrl: meal.photoUrl,
		prepNotes: meal.prepNotes,
		dietaryTags: meal.dietaryTags,
		additionalAllergens,
		effectiveAllergens,
		isActive: meal.isActive,
		ingredientCount: ingredients.length,
		ingredients: ingredients.map((ingredient) => ({
			id: ingredient.id,
			position: ingredient.position,
			amount: ingredient.amount,
			servingUnit: ingredient.food.servingUnit,
			food: {
				id: ingredient.food.id,
				name: ingredient.food.name,
				brand: ingredient.food.brand,
				servingSize: ingredient.food.servingSize,
				servingUnit: ingredient.food.servingUnit,
				calories: ingredient.food.calories,
				proteinG: ingredient.food.proteinG,
				carbsG: ingredient.food.carbsG,
				fatG: ingredient.food.fatG,
				fiberG: ingredient.food.fiberG,
				dietaryTags: ingredient.food.dietaryTags,
				allergens: ingredient.food.allergens,
				isActive: ingredient.food.isActive,
			},
			nutrients: calculateFoodNutrients(ingredient.food, ingredient.amount),
		})),
		totals: calculateMealTotals(ingredients),
		createdAt: meal.createdAt,
		updatedAt: meal.updatedAt,
	};
}
