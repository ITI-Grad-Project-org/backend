import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateMealDto } from '../dto/create-meal.dto';
import { QueryMealsDto } from '../dto/query-meals.dto';
import { ReplaceMealItemsDto } from '../dto/replace-meal-items.dto';
import { UpdateMealDto } from '../dto/update-meal.dto';
import { Meal } from '../entities/meal.entity';
import {
	assertMealIdentityAvailable,
	findActiveTenantFoodsOrFail,
	findTenantMealDetailsOrFail,
	findTenantMeals,
	lockTenantMealOrFail,
	throwMealConflictForUniqueViolation,
	writeMealIngredients,
} from '../helpers/meal-library.persistence';
import {
	assertActiveTenant,
	normalizeFoodLookupText,
} from '../utils/food-library.utils';
import {
	assertUniqueMealFoods,
	mapMealResponse,
	normalizeMealAllergens,
	normalizeMealDietaryTags,
	normalizeMealName,
	normalizeNullableMealText,
} from '../utils/meal-library.utils';

@Injectable()
export class MealLibraryService {
	constructor(private readonly dataSource: DataSource) {}

	async createMeal(
		tenantId: string | null,
		coachId: string,
		body: CreateMealDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		assertUniqueMealFoods(body.items);

		try {
			return await this.dataSource.transaction(async (manager) => {
				const repository = manager.getRepository(Meal);
				const name = normalizeMealName(body.name);
				await assertMealIdentityAvailable(repository, activeTenantId, name);
				const foodsById = await findActiveTenantFoodsOrFail(
					manager,
					activeTenantId,
					body.items,
				);

				const meal = await repository.save(
					repository.create({
						tenantId: activeTenantId,
						createdBy: { id: coachId },
						name,
						description: normalizeNullableMealText(body.description),
						photoUrl: normalizeNullableMealText(body.photoUrl),
						prepNotes: normalizeNullableMealText(body.prepNotes),
						dietaryTags: normalizeMealDietaryTags(body.dietaryTags),
						allergens: normalizeMealAllergens(body.allergens),
						isActive: true,
					}),
				);

				await writeMealIngredients(manager, meal.id, body.items, foodsById);
				const created = await findTenantMealDetailsOrFail(
					repository,
					activeTenantId,
					meal.id,
				);
				return mapMealResponse(created);
			});
		} catch (error) {
			throwMealConflictForUniqueViolation(error);
			throw error;
		}
	}

	async findMeals(tenantId: string | null, query: QueryMealsDto) {
		const activeTenantId = assertActiveTenant(tenantId);
		const meals = await findTenantMeals(
			this.dataSource.getRepository(Meal),
			activeTenantId,
			query,
		);
		return meals.map(mapMealResponse);
	}

	async findMeal(tenantId: string | null, mealId: string) {
		const activeTenantId = assertActiveTenant(tenantId);
		const meal = await findTenantMealDetailsOrFail(
			this.dataSource.getRepository(Meal),
			activeTenantId,
			mealId,
		);
		return mapMealResponse(meal);
	}

	async updateMeal(
		tenantId: string | null,
		mealId: string,
		body: UpdateMealDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);

		try {
			return await this.dataSource.transaction(async (manager) => {
				const meal = await lockTenantMealOrFail(
					manager,
					activeTenantId,
					mealId,
				);
				const repository = manager.getRepository(Meal);

				//can you explain to me what is this whole next name thing ? i don't really get it.
				const nextName =
					body.name === undefined ? meal.name : normalizeMealName(body.name);

				if (
					normalizeFoodLookupText(nextName) !==
					normalizeFoodLookupText(meal.name)
				) {
					await assertMealIdentityAvailable(
						repository,
						activeTenantId,
						nextName,
						meal.id,
					);
				}

				meal.name = nextName;
				if (body.description !== undefined) {
					meal.description = normalizeNullableMealText(body.description);
				}
				if (body.photoUrl !== undefined) {
					meal.photoUrl = normalizeNullableMealText(body.photoUrl);
				}
				if (body.prepNotes !== undefined) {
					meal.prepNotes = normalizeNullableMealText(body.prepNotes);
				}
				if (body.dietaryTags !== undefined) {
					meal.dietaryTags = normalizeMealDietaryTags(body.dietaryTags);
				}
				if (body.allergens !== undefined) {
					meal.allergens = normalizeMealAllergens(body.allergens);
				}
				if (body.isActive !== undefined) meal.isActive = body.isActive;

				await repository.save(meal);
				const updated = await findTenantMealDetailsOrFail(
					repository,
					activeTenantId,
					meal.id,
				);
				return mapMealResponse(updated);
			});
		} catch (error) {
			throwMealConflictForUniqueViolation(error);
			throw error;
		}
	}

	async replaceMealItems(
		tenantId: string | null,
		mealId: string,
		body: ReplaceMealItemsDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		assertUniqueMealFoods(body.items);

		return this.dataSource.transaction(async (manager) => {
			const meal = await lockTenantMealOrFail(manager, activeTenantId, mealId);
			const foodsById = await findActiveTenantFoodsOrFail(
				manager,
				activeTenantId,
				body.items,
			);
			await writeMealIngredients(manager, meal.id, body.items, foodsById, true);
			const updated = await findTenantMealDetailsOrFail(
				manager.getRepository(Meal),
				activeTenantId,
				meal.id,
			);
			return mapMealResponse(updated);
		});
	}

	async archiveMeal(tenantId: string | null, mealId: string) {
		const activeTenantId = assertActiveTenant(tenantId);
		return this.dataSource.transaction(async (manager) => {
			const meal = await lockTenantMealOrFail(manager, activeTenantId, mealId);
			meal.isActive = false;
			await manager.getRepository(Meal).save(meal);
			return { message: 'Meal archived' };
		});
	}
}
