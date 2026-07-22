import {
	BadRequestException,
	ConflictException,
	NotFoundException,
} from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { NutritionPlanStatus, NutritionPlanType } from '../../../common';
import { AddMealFromLibraryDto } from '../dto/nutrition-builder.dto';
import { Meal } from '../entities/meal.entity';
import { NutritionPlanDay } from '../entities/nutrition-plan-day.entity';
import { PlannedMealFood } from '../entities/planned-meal-food.entity';
import { PlannedMeal } from '../entities/planned-meal.entity';
import {
	assertUniqueItemOverrideIds,
	mapPlannedMealResponse,
} from '../utils/nutrition-builder.utils';
import {
	normalizeMealAllergens,
	normalizeNullableMealText,
} from '../utils/meal-library.utils';
import {
	assertRealisticMealFoodAmount,
	MAX_PLANNED_MEALS_PER_DAY,
} from '../utils/nutrition-validation.utils';

/**
 * Finds a nutrition-plan day that the coach is allowed to edit and locks it
 * for the rest of the current database transaction.
 *
 * In plain English, it:
 * 1. Loads the requested day together with its parent week and plan.
 * 2. Confirms that both the day and plan belong to the active tenant.
 * 3. Confirms that the day belongs to the requested plan.
 * 4. Allows only client plans that are still drafts, because other plan types
 *    and non-draft plans must not be changed by the builder.
 * 5. Takes a pessimistic write lock so two requests cannot safely edit the same
 *    day at the same time; the lock is released when the transaction finishes.
 * 6. Returns a not-found response when any check fails, including cross-tenant
 *    access, so the caller cannot discover another tenant's data.
 */
export async function lockEditableNutritionDay(
	manager: EntityManager,
	tenantId: string,
	planId: string,
	dayId: string,
) {
	const day = await manager
		.getRepository(NutritionPlanDay)
		.createQueryBuilder('day')
		.innerJoinAndSelect('day.nutritionPlanWeek', 'week')
		.innerJoinAndSelect('week.nutritionPlan', 'plan')
		.where('day.id = :dayId', { dayId })
		.andWhere('day.tenant_id = :tenantId', { tenantId })
		.andWhere('plan.id = :planId', { planId })
		.andWhere('plan.tenant_id = :tenantId', { tenantId })
		.andWhere('plan.plan_type = :planType', {
			planType: NutritionPlanType.CLIENT,
		})
		.andWhere('plan.status = :status', {
			status: NutritionPlanStatus.DRAFT,
		})
		.setLock('pessimistic_write')
		.getOne();

	if (!day) {
		throw new NotFoundException('Editable nutrition plan day not found');
	}

	return day;
}

/**
 * Loads one planned Meal only after proving that it belongs to an editable day
 * in the requested plan and tenant.
 *
 * In plain English, it:
 * 1. Looks up the planned Meal by id inside the active tenant so it can discover
 *    which nutrition-plan day owns it.
 * 2. Uses that day id to validate the requested plan and lock the parent day by
 *    calling `lockEditableNutritionDay`.
 * 3. Loads the planned Meal again with all of its snapshotted Foods.
 * 4. Orders those Foods by their stored position so edits and replacements use
 *    the same deterministic order shown by the builder.
 * 5. Returns not found if the Meal is missing, belongs to another tenant or
 *    plan, or belongs to a plan that is no longer editable.
 */
export async function getEditablePlannedMeal(
	manager: EntityManager,
	tenantId: string,
	planId: string,
	plannedMealId: string,
) {
	const repository = manager.getRepository(PlannedMeal);
	const candidate = await repository.findOne({
		where: { id: plannedMealId, tenantId },
	});
	if (!candidate) {
		throw new NotFoundException('Planned Meal not found');
	}

	await lockEditableNutritionDay(
		manager,
		tenantId,
		planId,
		candidate.nutritionPlanDayId,
	);

	const planned = await repository.findOne({
		where: {
			id: plannedMealId,
			tenantId,
			nutritionPlanDayId: candidate.nutritionPlanDayId,
		},
		relations: { foods: true },
		order: { foods: { position: 'ASC' } },
	});
	if (!planned) {
		throw new NotFoundException('Planned Meal not found');
	}

	return planned;
}

/**
 * Loads an active reusable library Meal and everything needed to create an
 * immutable planned snapshot from it.
 *
 * In plain English, it:
 * 1. Finds the Meal only inside the active tenant and only when it is active.
 * 2. Loads every reusable Meal ingredient and the library Food referenced by
 *    that ingredient in the same query.
 * 3. Sorts ingredients by their recipe position so the snapshot keeps the
 *    library Meal's current ordering.
 * 4. Takes a pessimistic read lock so the Meal and its loaded recipe cannot be
 *    changed while the surrounding transaction copies their values.
 * 5. Returns not found for missing, archived, cross-tenant, or incomplete Meals.
 */
export async function findActiveTenantMealForSnapshot(
	repository: Repository<Meal>,
	tenantId: string,
	mealId: string,
) {
	const meal = await repository
		.createQueryBuilder('meal')
		.innerJoinAndSelect('meal.ingredients', 'ingredient')
		.innerJoinAndSelect('ingredient.food', 'food')
		.where('meal.id = :mealId', { mealId })
		.andWhere('meal.tenant_id = :tenantId', { tenantId })
		.andWhere('meal.is_active = true')
		.orderBy('ingredient.position', 'ASC')
		.setLock('pessimistic_read')
		.getOne();

	if (!meal) {
		throw new NotFoundException('Active library Meal not found');
	}

	return meal;
}

/**
 * Retrieves a planned Meal in response-ready form after a create or update.
 *
 * In plain English, it:
 * 1. Searches for the planned Meal inside the active tenant.
 * 2. Loads its snapshotted Foods rather than reading current library Food data.
 * 3. Orders the Foods by position so the API response is deterministic.
 * 4. Throws not found if the requested planned Meal is unavailable; otherwise,
 *    it returns the complete entity for the response mapper.
 */
export async function findPlannedMealDetailsOrFail(
	repository: Repository<PlannedMeal>,
	tenantId: string,
	plannedMealId: string,
) {
	const planned = await repository.findOne({
		where: { id: plannedMealId, tenantId },
		relations: { foods: true },
		order: { foods: { position: 'ASC' } },
	});
	if (!planned) {
		throw new NotFoundException('Planned Meal not found');
	}
	return planned;
}

/**
 * Rewrites planned-Meal positions without colliding with the database's unique
 * day-and-position constraint.
 *
 * In plain English, it:
 * 1. Does nothing when the day has no stored Meals.
 * 2. Calculates a temporary range above every position currently in use.
 * 3. Moves all stored Meals into that temporary range, freeing positions
 *    `1..n` before any final position is assigned.
 * 4. Writes the requested order back as consecutive positions starting at 1.
 * 5. Updates the in-memory Meal objects as well, so code later in the same
 *    transaction sees the same positions that were written to the database.
 *
 * The temporary move is important when two Meals swap places: directly writing
 * one Meal into the other's occupied position could otherwise violate the
 * unique constraint halfway through the reorder.
 */
export async function rewritePlannedMealPositions(
	manager: EntityManager,
	currentlyStored: PlannedMeal[],
	desiredOrder: PlannedMeal[],
) {
	if (currentlyStored.length === 0) return;
	const repository = manager.getRepository(PlannedMeal);
	const temporaryStart =
		Math.max(...currentlyStored.map((meal) => meal.position)) + 1;

	for (let index = 0; index < currentlyStored.length; index++) {
		await repository.update(currentlyStored[index].id, {
			position: temporaryStart + index,
		});
	}
	for (let index = 0; index < desiredOrder.length; index++) {
		await repository.update(desiredOrder[index].id, { position: index + 1 });
		desiredOrder[index].position = index + 1;
	}
}

/**
 * Copies a reusable library Meal into one draft nutrition-plan day as an
 * immutable planned Meal and Food snapshot.
 *
 * In plain English, it:
 * 1. Rejects flexible days because flexible days cannot contain prescribed
 *    Meals.
 * 2. Sorts the reusable Meal ingredients and validates that each amount
 *    override appears once and belongs to this Meal.
 * 3. Applies the requested amounts; an amount of zero deliberately leaves that
 *    ingredient out of this particular planned snapshot.
 * 4. Requires at least one remaining Food and checks every amount against the
 *    realistic limit for that Food's serving unit.
 * 5. Loads the day's current Meals, enforces the per-day maximum, and validates
 *    the requested insertion position.
 * 6. Combines and normalizes allergens declared on the reusable Meal and on the
 *    Foods that will actually be included.
 * 7. Creates a planned Meal that keeps its source Meal id for lineage while
 *    copying the Meal's current name, description, media, preparation notes,
 *    dietary tags, allergens, slot, time, and coach notes.
 * 8. Creates one planned Food snapshot per included ingredient, preserving its
 *    source ids while copying the current display, serving, amount, and nutrient
 *    values. Later library edits therefore do not rewrite this prescription.
 * 9. Saves the new snapshot at the end first, then safely reorders the day's
 *    Meals when the coach requested an earlier position.
 * 10. Reloads the stored snapshot with its Foods and maps it into the calculated
 *     API response, including Food nutrients and Meal totals.
 *
 * The caller supplies a transaction-scoped EntityManager, so all snapshot and
 * position writes succeed or roll back together.
 */
export async function insertPlannedMealSnapshot(
	manager: EntityManager,
	day: NutritionPlanDay,
	meal: Meal,
	body: Omit<AddMealFromLibraryDto, 'mealId'>,
) {
	if (day.isFlexibleDay) {
		throw new ConflictException(
			'Flexible nutrition days cannot contain planned Meals',
		);
	}

	const ingredients = [...(meal.ingredients ?? [])].sort(
		(left, right) => left.position - right.position,
	);
	const overrides = body.itemOverrides ?? [];
	assertUniqueItemOverrideIds(overrides);
	const ingredientIds = new Set(ingredients.map((ingredient) => ingredient.id));
	for (const override of overrides) {
		if (!ingredientIds.has(override.mealIngredientId)) {
			throw new BadRequestException(
				'Every item override must belong to the selected reusable Meal',
			);
		}
	}
	const overridesById = new Map(
		overrides.map((override) => [override.mealIngredientId, override.amount]),
	);
	const includedIngredients = ingredients.filter(
		(ingredient) => (overridesById.get(ingredient.id) ?? ingredient.amount) > 0,
	);
	if (includedIngredients.length === 0) {
		throw new BadRequestException(
			'A planned Meal must contain at least one prescribed Food',
		);
	}
	for (const ingredient of includedIngredients) {
		assertRealisticMealFoodAmount(
			overridesById.get(ingredient.id) ?? ingredient.amount,
			ingredient.food.servingUnit,
		);
	}

	const repository = manager.getRepository(PlannedMeal);
	const existing = await repository.find({
		where: { nutritionPlanDayId: day.id },
		order: { position: 'ASC' },
	});
	if (existing.length >= MAX_PLANNED_MEALS_PER_DAY) {
		throw new BadRequestException(
			`A nutrition day cannot contain more than ${MAX_PLANNED_MEALS_PER_DAY} planned Meals`,
		);
	}
	const position = body.position ?? existing.length + 1;
	if (position < 1 || position > existing.length + 1) {
		throw new BadRequestException(
			`position must be between 1 and ${existing.length + 1}`,
		);
	}

	const foodRepository = manager.getRepository(PlannedMealFood);
	const effectiveAllergens = normalizeMealAllergens([
		...(meal.allergens ?? []),
		...includedIngredients.flatMap(
			(ingredient) => ingredient.food.allergens ?? [],
		),
	]);
	const planned = await repository.save(
		repository.create({
			tenantId: day.tenantId,
			nutritionPlanDayId: day.id,
			nutritionPlanDay: { id: day.id },
			sourceMealId: meal.id,
			sourceMeal: { id: meal.id },
			mealName: meal.name,
			description: meal.description,
			photoUrl: meal.photoUrl,
			prepNotes: meal.prepNotes,
			dietaryTags: [...(meal.dietaryTags ?? [])],
			allergens: effectiveAllergens,
			slot: body.slot,
			position: existing.length + 1,
			suggestedTime: body.suggestedTime ?? null,
			coachNotes: normalizeNullableMealText(body.coachNotes),
			foods: includedIngredients.map((ingredient, index) =>
				foodRepository.create({
					sourceFoodId: ingredient.food.id,
					sourceFood: { id: ingredient.food.id },
					sourceMealIngredientId: ingredient.id,
					sourceMealIngredient: { id: ingredient.id },
					foodName: ingredient.food.name,
					brand: ingredient.food.brand,
					servingSize: ingredient.food.servingSize,
					servingUnit: ingredient.food.servingUnit,
					amount: overridesById.get(ingredient.id) ?? ingredient.amount,
					caloriesPerServing: ingredient.food.calories,
					proteinGPerServing: ingredient.food.proteinG,
					carbsGPerServing: ingredient.food.carbsG,
					fatGPerServing: ingredient.food.fatG,
					fiberGPerServing: ingredient.food.fiberG,
					position: index + 1,
				}),
			),
		}),
	);

	if (position !== existing.length + 1) {
		const desiredOrder = [...existing];
		desiredOrder.splice(position - 1, 0, planned);
		await rewritePlannedMealPositions(
			manager,
			[...existing, planned],
			desiredOrder,
		);
	}

	const created = await findPlannedMealDetailsOrFail(
		repository,
		day.tenantId,
		planned.id,
	);
	return mapPlannedMealResponse(created);
}
