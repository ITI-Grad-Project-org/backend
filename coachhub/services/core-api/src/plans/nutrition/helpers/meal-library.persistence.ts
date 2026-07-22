import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { MealItemDto } from '../dto/create-meal.dto';
import { QueryMealsDto } from '../dto/query-meals.dto';
import { Food } from '../entities/food.entity';
import { MealIngredient } from '../entities/meal-ingredient.entity';
import { Meal } from '../entities/meal.entity';
import { normalizeFoodLookupText } from '../utils/food-library.utils';
import { assertRealisticMealFoodAmount } from '../utils/nutrition-validation.utils';

export const DUPLICATE_MEAL_MESSAGE = 'A Meal with this name already exists';

function tenantMealDetailsQuery(repository: Repository<Meal>) {
	return repository
		.createQueryBuilder('meal')
		.leftJoinAndSelect('meal.ingredients', 'ingredient')
		.leftJoinAndSelect('ingredient.food', 'food');
}

export async function assertMealIdentityAvailable(
	repository: Repository<Meal>,
	tenantId: string,
	name: string,
	excludeMealId?: string,
) {
	const query = repository
		.createQueryBuilder('meal')
		.where('meal.tenant_id = :tenantId', { tenantId })
		.andWhere('LOWER(meal.name) = :name', {
			name: normalizeFoodLookupText(name),
		});

	if (excludeMealId) {
		query.andWhere('meal.id != :excludeMealId', { excludeMealId });
	}

	if (await query.getOne()) {
		throw new ConflictException(DUPLICATE_MEAL_MESSAGE);
	}
}

export async function findTenantMeals(
	repository: Repository<Meal>,
	tenantId: string,
	filters: QueryMealsDto,
) {
	const query = tenantMealDetailsQuery(repository).where(
		'meal.tenant_id = :tenantId',
		{ tenantId },
	);

	if (!filters.includeInactive) {
		query.andWhere('meal.is_active = true');
	}

	if (filters.search?.trim()) {
		query.andWhere('meal.name ILIKE :search', {
			search: `%${filters.search.trim()}%`,
		});
	}

	if (filters.dietaryTag) {
		query.andWhere(':dietaryTag = ANY(meal.dietary_tags)', {
			dietaryTag: filters.dietaryTag,
		});
	}

	if (filters.allergen?.trim()) {
		query.andWhere(
			`(
				:allergen = ANY(meal.allergens)
				OR EXISTS (
					SELECT 1
					FROM meal_ingredients allergen_ingredient
					INNER JOIN foods allergen_food
						ON allergen_food.id = allergen_ingredient.food_id
					WHERE allergen_ingredient.meal_id = meal.id
						AND :allergen = ANY(allergen_food.allergens)
				)
			)`,
			{ allergen: normalizeFoodLookupText(filters.allergen) },
		);
	}

	return query
		.orderBy('LOWER(meal.name)', 'ASC')
		.addOrderBy('meal.id', 'ASC')
		.addOrderBy('ingredient.position', 'ASC')
		.getMany();
}

export async function findTenantMealDetailsOrFail(
	repository: Repository<Meal>,
	tenantId: string,
	mealId: string,
) {
	const meal = await tenantMealDetailsQuery(repository)
		.where('meal.id = :mealId', { mealId })
		.andWhere('meal.tenant_id = :tenantId', { tenantId })
		.orderBy('ingredient.position', 'ASC')
		.getOne();

	if (!meal) {
		throw new NotFoundException('Meal not found');
	}

	return meal;
}

export async function lockTenantMealOrFail(
	manager: EntityManager,
	tenantId: string,
	mealId: string,
) {
	const meal = await manager
		.getRepository(Meal)
		.createQueryBuilder('meal')
		.where('meal.id = :mealId', { mealId })
		.andWhere('meal.tenant_id = :tenantId', { tenantId })
		.setLock('pessimistic_write')
		.getOne();

	if (!meal) {
		throw new NotFoundException('Meal not found');
	}

	return meal;
}

export async function findActiveTenantFoodsOrFail(
	manager: EntityManager,
	tenantId: string,
	items: MealItemDto[],
) {
	const foodIds = items.map((item) => item.foodId);
	const foods = await manager
		.getRepository(Food)
		.createQueryBuilder('food')
		.where('food.id IN (:...foodIds)', { foodIds })
		.andWhere('food.tenant_id = :tenantId', { tenantId })
		.andWhere('food.is_active = true')
		.setLock('pessimistic_read')
		.getMany();

	if (foods.length !== foodIds.length) {
		throw new NotFoundException(
			'One or more active library Foods were not found',
		);
	}
	return new Map(foods.map((food) => [food.id, food]));
}

export async function writeMealIngredients(
	manager: EntityManager,
	mealId: string,
	items: MealItemDto[],
	foodsById: Map<string, Food>,
	replaceExisting = false,
) {
	const repository = manager.getRepository(MealIngredient);
	for (const item of items) {
		const food = foodsById.get(item.foodId);
		if (food) {
			assertRealisticMealFoodAmount(item.amount, food.servingUnit);
		}
	}
	if (replaceExisting) {
		await repository.delete({ mealId });
	}

	const ingredients = items.map((item, index) =>
		repository.create({
			mealId,
			meal: { id: mealId },
			foodId: item.foodId,
			food: foodsById.get(item.foodId),
			amount: item.amount,
			position: index + 1,
		}),
	);

	return repository.save(ingredients);
}

export function throwMealConflictForUniqueViolation(error: unknown) {
	if (
		error instanceof QueryFailedError &&
		(error.driverError as { code?: string } | undefined)?.code === '23505'
	) {
		throw new ConflictException(DUPLICATE_MEAL_MESSAGE);
	}
}
