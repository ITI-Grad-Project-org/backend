import { ConflictException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import {
	FitnessGoal,
	MealSlot,
	NutritionPlanStatus,
	NutritionPlanType,
} from '../../common';
import { deriveInclusiveEndDate } from '../../common/utils/date-only.utils';
import { Meal } from '../../plans/nutrition/entities/meal.entity';
import { NutritionPlanDay } from '../../plans/nutrition/entities/nutrition-plan-day.entity';
import { NutritionPlanWeek } from '../../plans/nutrition/entities/nutrition-plan-week.entity';
import { NutritionPlan } from '../../plans/nutrition/entities/nutrition-plan.entity';
import { PlannedMealFood } from '../../plans/nutrition/entities/planned-meal-food.entity';
import { PlannedMeal } from '../../plans/nutrition/entities/planned-meal.entity';
import { normalizeMealAllergens } from '../../plans/nutrition/utils/meal-library.utils';
import { MAX_PLANNED_MEALS_PER_DAY } from '../../plans/nutrition/utils/nutrition-validation.utils';
import { roundNutrient } from '../../plans/nutrition/utils/nutrition-number.utils';
import {
	readArray,
	readBoolean,
	readEnum,
	readInt,
	readNumber,
	readRecord,
	readString,
	renumber,
} from '../utils/plan-json.utils';
import { StalePlanReferencesError } from './stale-plan-references.error';

export interface BuildNutritionPlanInput {
	tenantId: string;
	coachId: string;
	membershipId: string;
	plan: Record<string, unknown>;
	durationWeeks: number;
	goal: FitnessGoal | null;
	startDate: string;
	nameOverride: string | null;
}

interface PlannedDay {
	dayNumber: number;
	isFlexibleDay: boolean;
	notes: string | null;
	meals: PlannedMealInput[];
}

interface PlannedMealInput {
	sourceMealId: string;
	slot: MealSlot;
	servings: number;
	suggestedTime: string | null;
	coachNotes: string | null;
}

/** A portion multiplier past this is a data error, not a large appetite. */
const MAX_SERVINGS = 10;

/**
 * Turns an accepted nutrition suggestion into a real client plan.
 *
 * <h2>Meals, not ingredients</h2>
 *
 * `planned_meals.source_meal_id` is NOT NULL, so a plan is assembled from the
 * coach's meals and never from loose foods. The model picks a meal and a portion
 * multiplier; the ingredient rows are copied here from the live meal, with
 * `source_meal_ingredient_id` preserving the lineage back to it.
 *
 * The week repeats for the same reason the training week does — see
 * {@link ../helpers/training-program.persistence.ts}.
 */
export async function buildNutritionPlanFromPlan(
	manager: EntityManager,
	input: BuildNutritionPlanInput,
): Promise<NutritionPlan> {
	const days = readNutritionDays(input.plan);
	const meals = await loadMeals(manager, input.tenantId, days);

	const targets = readRecord(input.plan.targets) ?? {};
	const progressionNote = readProgressionNote(input.plan);
	const planRepository = manager.getRepository(NutritionPlan);
	const weekRepository = manager.getRepository(NutritionPlanWeek);
	const dayRepository = manager.getRepository(NutritionPlanDay);

	const plan = await planRepository.save(
		planRepository.create({
			tenantId: input.tenantId,
			tenant: { id: input.tenantId },
			createdBy: { id: input.coachId },
			planType: NutritionPlanType.CLIENT,
			membershipId: input.membershipId,
			membership: { id: input.membershipId },
			name:
				input.nameOverride ??
				readString(input.plan.name, 150) ??
				'AI nutrition plan',
			description: readString(input.plan.description),
			goal: input.goal,
			durationWeeks: input.durationWeeks,
			startDate: input.startDate,
			endDate: deriveInclusiveEndDate(input.startDate, input.durationWeeks),
			// ck_nutrition_plans_targets rejects a non-positive calorie target and any
			// negative macro, so anything that would break it becomes "not set".
			targetCalories: positiveOrNull(readInt(targets.calories)),
			targetProteinG: nonNegativeOrNull(readInt(targets.proteinG)),
			targetCarbsG: nonNegativeOrNull(readInt(targets.carbsG)),
			targetFatG: nonNegativeOrNull(readInt(targets.fatG)),
			targetFiberG: nonNegativeOrNull(readInt(targets.fiberG)),
			targetWaterMl: nonNegativeOrNull(readInt(targets.waterMl)),
			status: NutritionPlanStatus.DRAFT,
			weeks: Array.from({ length: input.durationWeeks }, (_, index) =>
				weekRepository.create({
					tenantId: input.tenantId,
					tenant: { id: input.tenantId },
					weekNumber: index + 1,
					notes: index === 0 ? null : progressionNote,
					days: days.map((day) =>
						dayRepository.create({
							tenantId: input.tenantId,
							tenant: { id: input.tenantId },
							dayNumber: day.dayNumber,
							isFlexibleDay: day.isFlexibleDay,
							notes: day.notes,
						}),
					),
				}),
			),
		}),
	);

	await savePlannedMeals(manager, input.tenantId, plan, days, meals);
	return plan;
}

async function savePlannedMeals(
	manager: EntityManager,
	tenantId: string,
	plan: NutritionPlan,
	days: PlannedDay[],
	meals: Map<string, Meal>,
) {
	const mealRepository = manager.getRepository(PlannedMeal);
	const foodRepository = manager.getRepository(PlannedMealFood);
	const rows: PlannedMeal[] = [];

	for (const week of plan.weeks) {
		for (const storedDay of week.days) {
			const source = days.find((day) => day.dayNumber === storedDay.dayNumber);
			source?.meals.forEach((planned, index) => {
				const meal = meals.get(planned.sourceMealId);
				if (!meal) {
					return;
				}
				const ingredients = [...(meal.ingredients ?? [])].sort(
					(left, right) => left.position - right.position,
				);

				rows.push(
					mealRepository.create({
						tenantId,
						tenant: { id: tenantId },
						nutritionPlanDayId: storedDay.id,
						nutritionPlanDay: { id: storedDay.id },
						sourceMealId: meal.id,
						sourceMeal: { id: meal.id },
						mealName: meal.name,
						description: meal.description,
						photoUrl: meal.photoUrl,
						prepNotes: meal.prepNotes,
						dietaryTags: [...(meal.dietaryTags ?? [])],
						// The meal's own allergens plus every ingredient's, exactly as the
						// manual builder computes them.
						allergens: normalizeMealAllergens([
							...(meal.allergens ?? []),
							...ingredients.flatMap((item) => item.food?.allergens ?? []),
						]),
						slot: planned.slot,
						position: index + 1,
						suggestedTime: planned.suggestedTime,
						coachNotes: planned.coachNotes,
						foods: ingredients.map((ingredient, foodIndex) =>
							foodRepository.create({
								sourceFoodId: ingredient.food.id,
								sourceFood: { id: ingredient.food.id },
								sourceMealIngredientId: ingredient.id,
								sourceMealIngredient: { id: ingredient.id },
								foodName: ingredient.food.name,
								brand: ingredient.food.brand,
								servingSize: ingredient.food.servingSize,
								servingUnit: ingredient.food.servingUnit,
								// Where the portion multiplier lands. `planned_meals` has no
								// column for it, so it is applied to the amounts — which is
								// also the only place it would have any effect.
								amount: roundNutrient(ingredient.amount * planned.servings),
								caloriesPerServing: ingredient.food.calories,
								proteinGPerServing: ingredient.food.proteinG,
								carbsGPerServing: ingredient.food.carbsG,
								fatGPerServing: ingredient.food.fatG,
								fiberGPerServing: ingredient.food.fiberG,
								position: foodIndex + 1,
							}),
						),
					}),
				);
			});
		}
	}

	if (rows.length > 0) {
		await mealRepository.save(rows);
	}
}

/**
 * Loads every meal the plan names, with its ingredients.
 *
 * `source_meal_id` is ON DELETE RESTRICT and `meal_ingredients.food_id` likewise,
 * so a meal the coach retired since generation cannot be written. Naming the ids
 * beats a foreign-key violation three levels down.
 */
async function loadMeals(
	manager: EntityManager,
	tenantId: string,
	days: PlannedDay[],
): Promise<Map<string, Meal>> {
	const wanted = [
		...new Set(
			days.flatMap((day) => day.meals.map((meal) => meal.sourceMealId)),
		),
	];
	if (wanted.length === 0) {
		return new Map();
	}

	const rows = await manager.getRepository(Meal).find({
		where: { tenantId, id: In(wanted), isActive: true },
		relations: { ingredients: { food: true } },
	});
	const found = new Map(rows.map((row) => [row.id, row]));
	const missing = wanted.filter((id) => !found.has(id));

	if (missing.length > 0) {
		throw new StalePlanReferencesError('meal', missing);
	}
	return found;
}

function readProgressionNote(plan: Record<string, unknown>): string | null {
	const progression = readRecord(plan.progression);
	return progression ? readString(progression.note) : null;
}

function readNutritionDays(plan: Record<string, unknown>): PlannedDay[] {
	const week = readRecord(plan.week);
	const rawDays = readArray(week?.days);
	if (rawDays.length === 0) {
		throw new ConflictException('The stored plan contains no days');
	}

	const seen = new Set<number>();
	const days: PlannedDay[] = [];

	for (const raw of rawDays) {
		const day = readRecord(raw);
		const dayNumber = readInt(day?.dayNumber);
		if (!day || dayNumber === null || dayNumber < 1 || dayNumber > 7) {
			throw new ConflictException(
				`The stored plan has a day numbered ${dayNumber ?? 'nothing'}; days run 1 to 7`,
			);
		}
		if (seen.has(dayNumber)) {
			throw new ConflictException(`The stored plan repeats day ${dayNumber}`);
		}
		seen.add(dayNumber);

		days.push({
			dayNumber,
			isFlexibleDay: readBoolean(day.isFlexibleDay),
			notes: readString(day.notes),
			meals: readMeals(day, dayNumber),
		});
	}

	return days;
}

function readMeals(
	day: Record<string, unknown>,
	dayNumber: number,
): PlannedMealInput[] {
	const raw = readArray(day.meals);
	if (raw.length > MAX_PLANNED_MEALS_PER_DAY) {
		throw new ConflictException(
			`Day ${dayNumber} prescribes ${raw.length} meals; the limit is ${MAX_PLANNED_MEALS_PER_DAY}`,
		);
	}

	return renumber(raw, (item) => readInt(readRecord(item)?.position)).map(
		(item) => {
			const meal = readRecord(item);
			const sourceMealId = readString(meal?.sourceMealId);
			const slot = readEnum(meal?.slot, Object.values(MealSlot));
			if (!meal || !sourceMealId) {
				throw new ConflictException(`Day ${dayNumber} has a meal with no id`);
			}
			if (!slot) {
				throw new ConflictException(
					`Day ${dayNumber} has a meal with no recognisable slot`,
				);
			}

			const servings = readNumber(meal.servings);
			return {
				sourceMealId,
				slot,
				// ck_planned_meal_foods_amount needs a positive amount, and the multiplier
				// is what decides it. Anything absent or nonsensical is one portion.
				servings:
					servings === null || servings <= 0 || servings > MAX_SERVINGS
						? 1
						: servings,
				suggestedTime: readString(meal.suggestedTime, 8),
				coachNotes: readString(meal.coachNotes),
			};
		},
	);
}

function positiveOrNull(value: number | null) {
	return value !== null && value > 0 ? value : null;
}

function nonNegativeOrNull(value: number | null) {
	return value !== null && value >= 0 ? value : null;
}
