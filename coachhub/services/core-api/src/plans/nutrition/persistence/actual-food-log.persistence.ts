import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ServingUnit } from '../../../common';
import {
	CreateActualFoodLogDto,
	UpdateActualFoodLogDto,
} from '../dto/nutrition-logging.dto';
import { FoodLog } from '../entities/food-log.entity';
import { Food } from '../entities/food.entity';
import { LoggedMeal } from '../entities/logged-meal.entity';
import {
	normalizeFoodDisplayText,
	normalizeNullableFoodDisplayText,
} from '../utils/food-library.utils';
import {
	calculateLibraryFoodLogSnapshot,
	recalculateLibraryFoodLogAmount,
} from '../utils/nutrition-food-log.utils';
import {
	assertRealisticActualFoodAmount,
	assertRealisticActualFoodNutrients,
	assertRealisticFoodReferenceAmount,
} from '../utils/nutrition-validation.utils';

export async function assertLoggedMealBelongsToLog(
	manager: EntityManager,
	logId: string,
	loggedMealId: string | null,
) {
	if (loggedMealId === null) return;

	const loggedMeal = await manager.getRepository(LoggedMeal).findOne({
		where: { id: loggedMealId, nutritionDayLogId: logId },
		select: { id: true },
	});
	if (!loggedMeal) {
		throw new NotFoundException('Logged Meal not found');
	}
}

/**
 * Applies either the library-backed or manual definition to one actual Food
 * entity. The caller owns the transaction and saves the entity after this
 * function has produced a complete, validated snapshot.
 */
export async function applyActualFoodDefinition(
	manager: EntityManager,
	foodLog: FoodLog,
	tenantId: string,
	body: CreateActualFoodLogDto | UpdateActualFoodLogDto,
) {
	const nextFoodId =
		body.foodId === undefined ? foodLog.foodId : (body.foodId ?? null);

	if (nextFoodId) {
		assertNoManualFoodSnapshotFields(body);
		const amount = body.amount === undefined ? foodLog.amount : body.amount;
		if (amount === null || amount === undefined) {
			throw new BadRequestException(
				'amount is required for a library-backed actual Food entry',
			);
		}

		if (foodLog.foodId === nextFoodId) {
			if (body.amount !== undefined && body.amount !== foodLog.amount) {
				assertRealisticActualFoodAmount(
					body.amount,
					foodLog.servingUnit as ServingUnit,
				);
				const snapshot = recalculateLibraryFoodLogAmount(foodLog, body.amount);
				assertRealisticActualFoodNutrients(snapshot);
				Object.assign(foodLog, snapshot);
			}
			return;
		}

		const food = await manager.getRepository(Food).findOne({
			where: {
				id: nextFoodId,
				tenantId,
				isActive: true,
			},
		});
		if (!food) {
			throw new NotFoundException('Active Food not found');
		}
		assertRealisticActualFoodAmount(amount, food.servingUnit);
		const snapshot = calculateLibraryFoodLogSnapshot(food, amount);
		assertRealisticActualFoodNutrients(snapshot);
		Object.assign(foodLog, snapshot);
		return;
	}

	foodLog.foodId = null;
	const suppliedFoodName = body.foodName as string | null | undefined;
	const foodName =
		suppliedFoodName === undefined
			? foodLog.foodName
			: suppliedFoodName === null
				? ''
				: normalizeFoodDisplayText(suppliedFoodName);
	if (!foodName) {
		throw new BadRequestException(
			'foodName is required for a manual actual Food entry',
		);
	}
	foodLog.foodName = foodName;

	if (body.brand !== undefined) {
		foodLog.brand = normalizeNullableFoodDisplayText(body.brand);
	}
	if (body.servingSize !== undefined) {
		foodLog.servingSize = body.servingSize;
	}
	if (body.servingUnit !== undefined) {
		foodLog.servingUnit = body.servingUnit;
	}
	if (body.amount !== undefined) foodLog.amount = body.amount;
	if (body.calories !== undefined) foodLog.calories = body.calories;
	if (body.proteinG !== undefined) foodLog.proteinG = body.proteinG;
	if (body.carbsG !== undefined) foodLog.carbsG = body.carbsG;
	if (body.fatG !== undefined) foodLog.fatG = body.fatG;
	if (body.fiberG !== undefined) foodLog.fiberG = body.fiberG;

	if (foodLog.servingSize !== null && foodLog.servingUnit !== null) {
		assertRealisticFoodReferenceAmount(
			foodLog.servingSize,
			foodLog.servingUnit,
		);
	}
	if (foodLog.amount !== null && foodLog.servingUnit !== null) {
		assertRealisticActualFoodAmount(foodLog.amount, foodLog.servingUnit);
	}
	assertRealisticActualFoodNutrients(foodLog);
}

function assertNoManualFoodSnapshotFields(
	body: CreateActualFoodLogDto | UpdateActualFoodLogDto,
) {
	const manualFields = [
		'foodName',
		'brand',
		'servingSize',
		'servingUnit',
		'calories',
		'proteinG',
		'carbsG',
		'fatG',
		'fiberG',
	] as const;
	if (manualFields.some((field) => body[field] !== undefined)) {
		throw new BadRequestException(
			'Library-backed entries accept foodId and amount; Food details are copied by the server',
		);
	}
}
