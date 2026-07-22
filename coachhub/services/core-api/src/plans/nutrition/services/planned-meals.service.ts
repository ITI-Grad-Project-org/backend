import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
	AddMealFromLibraryDto,
	CreateLibraryMealAndAddDto,
	ReplacePlannedMealItemsDto,
	UpdatePlannedMealDto,
} from '../dto/nutrition-builder.dto';
import { Meal } from '../entities/meal.entity';
import { PlannedMealFood } from '../entities/planned-meal-food.entity';
import { PlannedMeal } from '../entities/planned-meal.entity';
import {
	assertMealIdentityAvailable,
	findActiveTenantFoodsOrFail,
	throwMealConflictForUniqueViolation,
	writeMealIngredients,
} from '../helpers/meal-library.persistence';
import {
	findActiveTenantMealForSnapshot,
	findPlannedMealDetailsOrFail,
	getEditablePlannedMeal,
	insertPlannedMealSnapshot,
	lockEditableNutritionDay,
	rewritePlannedMealPositions,
} from '../helpers/nutrition-builder.persistence';
import { assertNutritionTenant } from '../utils/client-nutrition-plan.utils';
import {
	assertUniqueMealFoods,
	mapMealResponse,
	normalizeMealAllergens,
	normalizeMealDietaryTags,
	normalizeMealName,
	normalizeNullableMealText,
} from '../utils/meal-library.utils';
import {
	assertUniquePlannedFoodIds,
	mapPlannedMealResponse,
} from '../utils/nutrition-builder.utils';
import { assertRealisticMealFoodAmount } from '../utils/nutrition-validation.utils';

@Injectable()
export class PlannedMealsService {
	constructor(private readonly dataSource: DataSource) {}

	async addMealFromLibrary(
		tenantId: string | null,
		planId: string,
		dayId: string,
		body: AddMealFromLibraryDto,
	) {
		const activeTenantId = assertNutritionTenant(tenantId);
		return this.dataSource.transaction(async (manager) => {
			const day = await lockEditableNutritionDay(
				manager,
				activeTenantId,
				planId,
				dayId,
			);
			const meal = await findActiveTenantMealForSnapshot(
				manager.getRepository(Meal),
				activeTenantId,
				body.mealId,
			);
			return insertPlannedMealSnapshot(manager, day, meal, body);
		});
	}

	async createLibraryMealAndAdd(
		tenantId: string | null,
		coachId: string,
		planId: string,
		dayId: string,
		body: CreateLibraryMealAndAddDto,
	) {
		const activeTenantId = assertNutritionTenant(tenantId);
		assertUniqueMealFoods(body.meal.items);

		try {
			return await this.dataSource.transaction(async (manager) => {
				const day = await lockEditableNutritionDay(
					manager,
					activeTenantId,
					planId,
					dayId,
				);
				const repository = manager.getRepository(Meal);
				const name = normalizeMealName(body.meal.name);
				await assertMealIdentityAvailable(repository, activeTenantId, name);
				const foodsById = await findActiveTenantFoodsOrFail(
					manager,
					activeTenantId,
					body.meal.items,
				);

				const meal = await repository.save(
					repository.create({
						tenantId: activeTenantId,
						createdBy: { id: coachId },
						name,
						description: normalizeNullableMealText(body.meal.description),
						photoUrl: normalizeNullableMealText(body.meal.photoUrl),
						prepNotes: normalizeNullableMealText(body.meal.prepNotes),
						dietaryTags: normalizeMealDietaryTags(body.meal.dietaryTags),
						allergens: normalizeMealAllergens(body.meal.allergens),
						isActive: true,
					}),
				);
				await writeMealIngredients(
					manager,
					meal.id,
					body.meal.items,
					foodsById,
				);
				const createdMeal = await findActiveTenantMealForSnapshot(
					repository,
					activeTenantId,
					meal.id,
				);
				const inlineOverrides = body.prescription.itemOverrides ?? [];
				const overriddenFoodIds = new Set<string>();
				for (const override of inlineOverrides) {
					if (overriddenFoodIds.has(override.foodId)) {
						throw new BadRequestException(
							'Each Food can be overridden only once in an inline prescription',
						);
					}
					overriddenFoodIds.add(override.foodId);
				}
				const ingredientByFoodId = new Map(
					createdMeal.ingredients.map((ingredient) => [
						ingredient.foodId,
						ingredient,
					]),
				);
				if (
					inlineOverrides.some(
						(override) => !ingredientByFoodId.has(override.foodId),
					)
				) {
					throw new BadRequestException(
						'Every inline item override must reference a Food in the new Meal',
					);
				}
				const { itemOverrides: _itemOverrides, ...prescription } =
					body.prescription;
				const plannedMeal = await insertPlannedMealSnapshot(
					manager,
					day,
					createdMeal,
					{
						...prescription,
						itemOverrides: inlineOverrides.map((override) => ({
							mealIngredientId: ingredientByFoodId.get(override.foodId).id,
							amount: override.amount,
						})),
					},
				);

				return {
					meal: mapMealResponse(createdMeal),
					plannedMeal,
				};
			});
		} catch (error) {
			throwMealConflictForUniqueViolation(error);
			throw error;
		}
	}

	async updatePlannedMeal(
		tenantId: string | null,
		planId: string,
		plannedMealId: string,
		body: UpdatePlannedMealDto,
	) {
		const activeTenantId = assertNutritionTenant(tenantId);
		return this.dataSource.transaction(async (manager) => {
			const planned = await getEditablePlannedMeal(
				manager,
				activeTenantId,
				planId,
				plannedMealId,
			);
			const repository = manager.getRepository(PlannedMeal);

			if (body.position !== undefined && body.position !== planned.position) {
				const ordered = await repository.find({
					where: {
						nutritionPlanDayId: planned.nutritionPlanDayId,
						tenantId: activeTenantId,
					},
					order: { position: 'ASC' },
				});
				if (body.position > ordered.length) {
					throw new BadRequestException(
						`position must be between 1 and ${ordered.length}`,
					);
				}
				const desiredOrder = ordered.filter((meal) => meal.id !== planned.id);
				desiredOrder.splice(body.position - 1, 0, planned);
				await rewritePlannedMealPositions(manager, ordered, desiredOrder);
				planned.position = body.position;
			}

			if (body.slot !== undefined) planned.slot = body.slot;
			if (body.suggestedTime !== undefined) {
				planned.suggestedTime = body.suggestedTime;
			}
			if (body.coachNotes !== undefined) {
				planned.coachNotes = normalizeNullableMealText(body.coachNotes);
			}
			await repository.save(planned);

			const updated = await findPlannedMealDetailsOrFail(
				repository,
				activeTenantId,
				planned.id,
			);
			return mapPlannedMealResponse(updated);
		});
	}

	async replacePlannedMealItems(
		tenantId: string | null,
		planId: string,
		plannedMealId: string,
		body: ReplacePlannedMealItemsDto,
	) {
		const activeTenantId = assertNutritionTenant(tenantId);
		assertUniquePlannedFoodIds(body.items);

		return this.dataSource.transaction(async (manager) => {
			const planned = await getEditablePlannedMeal(
				manager,
				activeTenantId,
				planId,
				plannedMealId,
			);
			const existingById = new Map(
				planned.foods.map((food) => [food.id, food]),
			);
			if (
				body.items.length !== planned.foods.length ||
				body.items.some((item) => !existingById.has(item.plannedMealFoodId))
			) {
				throw new BadRequestException(
					'items must contain every current planned Meal Food exactly once',
				);
			}
			for (const item of body.items) {
				const existing = existingById.get(item.plannedMealFoodId);
				assertRealisticMealFoodAmount(item.amount, existing.servingUnit);
			}

			const foodRepository = manager.getRepository(PlannedMealFood);
			const temporaryStart =
				Math.max(...planned.foods.map((food) => food.position)) + 1;
			for (let index = 0; index < planned.foods.length; index++) {
				await foodRepository.update(planned.foods[index].id, {
					position: temporaryStart + index,
				});
			}

			for (let index = 0; index < body.items.length; index++) {
				await foodRepository.update(body.items[index].plannedMealFoodId, {
					amount: body.items[index].amount,
					position: index + 1,
				});
			}

			const updated = await findPlannedMealDetailsOrFail(
				manager.getRepository(PlannedMeal),
				activeTenantId,
				planned.id,
			);
			return mapPlannedMealResponse(updated);
		});
	}

	async deletePlannedMeal(
		tenantId: string | null,
		planId: string,
		plannedMealId: string,
	) {
		const activeTenantId = assertNutritionTenant(tenantId);
		return this.dataSource.transaction(async (manager) => {
			const planned = await getEditablePlannedMeal(
				manager,
				activeTenantId,
				planId,
				plannedMealId,
			);
			const repository = manager.getRepository(PlannedMeal);
			const ordered = await repository.find({
				where: {
					nutritionPlanDayId: planned.nutritionPlanDayId,
					tenantId: activeTenantId,
				},
				order: { position: 'ASC' },
			});
			await repository.delete(planned.id);
			const remaining = ordered.filter((meal) => meal.id !== planned.id);
			await rewritePlannedMealPositions(manager, remaining, remaining);
			return { message: 'Planned Meal deleted' };
		});
	}
}
