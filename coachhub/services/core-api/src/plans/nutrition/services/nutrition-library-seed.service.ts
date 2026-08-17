import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DefaultFood } from '../entities/default-food.entity';
import { DefaultMeal } from '../entities/default-meal.entity';
import { assertActiveTenant } from '../utils/food-library.utils';

export interface LibrarySeedResult {
	foods: { created: number; skipped: number };
	meals: { created: number; skipped: number };
}

/**
 * Copies the system starter set into one tenant's food and meal library.
 *
 * <h2>Why a coach needs this at all</h2>
 *
 * A nutrition plan is assembled from `meals`, because `planned_meals.source_meal_id`
 * is NOT NULL. With an empty library the AI has nothing to select: it can still
 * work out sensible daily targets, but every day comes back with no meals on it.
 * That is what this fixes, and it is the same problem
 * `initialize-library-from-defaults` already solves for exercises.
 */
@Injectable()
export class NutritionLibrarySeedService {
	constructor(private readonly dataSource: DataSource) {}

	/**
	 * Foods first, then meals — a meal's ingredients are resolved through this
	 * tenant's own food rows, so a meal whose ingredients were not copied cannot
	 * be copied either.
	 *
	 * Both halves are idempotent: a food already present by lineage or by name is
	 * skipped, so running this twice adds nothing the second time.
	 */
	async initializeLibrary(
		tenantId: string | null,
		coachId: string,
	): Promise<LibrarySeedResult> {
		const activeTenantId = assertActiveTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const [foodSeeds, mealSeeds] = await Promise.all([
				manager.getRepository(DefaultFood).countBy({ isActive: true }),
				manager.getRepository(DefaultMeal).countBy({ isActive: true }),
			]);

			if (foodSeeds === 0 && mealSeeds === 0) {
				throw new NotFoundException(
					'No default foods or meals were found. Contact support, or fill your library manually.',
				);
			}

			const foods = await this.copyFoods(manager, activeTenantId, coachId);
			const meals = await this.copyMeals(manager, activeTenantId, coachId);

			return {
				foods: { created: foods, skipped: foodSeeds - foods },
				meals: { created: meals, skipped: mealSeeds - meals },
			};
		});
	}

	/**
	 * Skips a seed the tenant already holds, matched either by lineage or by the
	 * same name and brand — a coach who typed "Rolled Oats" themselves should not
	 * end up with two, and `ux_foods_tenant_name_brand` would reject the second
	 * anyway.
	 */
	private async copyFoods(
		manager: EntityManager,
		tenantId: string,
		coachId: string,
	): Promise<number> {
		const created: Array<{ id: string }> = await manager.query(
			`INSERT INTO foods
			 (tenant_id, source_seed_id, created_by, name, brand, serving_size,
			  serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g,
			  dietary_tags, allergens, is_active)
			 SELECT $1, seed.id, $2, seed.name, seed.brand, seed.serving_size,
			        seed.serving_unit, seed.calories, seed.protein_g, seed.carbs_g,
			        seed.fat_g, seed.fiber_g, seed.dietary_tags, seed.allergens, TRUE
			 FROM default_foods seed
			 WHERE seed.is_active
			   AND NOT EXISTS (
			     SELECT 1 FROM foods existing
			     WHERE existing.tenant_id = $1
			       AND (
			         existing.source_seed_id = seed.id
			         OR (LOWER(existing.name) = LOWER(seed.name)
			             AND existing.brand IS NOT DISTINCT FROM seed.brand)
			       )
			   )
			 ON CONFLICT (tenant_id, name, brand) DO NOTHING
			 RETURNING id`,
			[tenantId, coachId],
		);
		return created.length;
	}

	/**
	 * Copies a meal only when every one of its ingredients resolved to a food this
	 * tenant now owns.
	 *
	 * The alternative — copying the meal and silently dropping an ingredient — is
	 * worse than not copying it: the macros would be wrong and nothing on screen
	 * would say why.
	 */
	private async copyMeals(
		manager: EntityManager,
		tenantId: string,
		coachId: string,
	): Promise<number> {
		const created: Array<{ id: string }> = await manager.query(
			`INSERT INTO meals
			 (tenant_id, source_seed_id, created_by, name, description, prep_notes,
			  dietary_tags, allergens, is_active)
			 SELECT $1, seed.id, $2, seed.name, seed.description, seed.prep_notes,
			        seed.dietary_tags, seed.allergens, TRUE
			 FROM default_meals seed
			 WHERE seed.is_active
			   AND NOT EXISTS (
			     SELECT 1 FROM meals existing
			     WHERE existing.tenant_id = $1
			       AND (existing.source_seed_id = seed.id
			            OR LOWER(existing.name) = LOWER(seed.name))
			   )
			   AND NOT EXISTS (
			     SELECT 1
			     FROM default_meal_ingredients di
			     WHERE di.meal_id = seed.id
			       AND NOT EXISTS (
			         SELECT 1 FROM foods f
			         WHERE f.tenant_id = $1 AND f.source_seed_id = di.food_id
			       )
			   )
			 ON CONFLICT (tenant_id, name) DO NOTHING
			 RETURNING id`,
			[tenantId, coachId],
		);

		if (created.length > 0) {
			await manager.query(
				`INSERT INTO meal_ingredients (meal_id, food_id, amount, position)
				 SELECT m.id, f.id, di.amount, di.position
				 FROM meals m
				 JOIN default_meal_ingredients di ON di.meal_id = m.source_seed_id
				 JOIN foods f ON f.tenant_id = m.tenant_id AND f.source_seed_id = di.food_id
				 WHERE m.id = ANY($1::uuid[])`,
				[created.map((row) => row.id)],
			);
		}

		return created.length;
	}
}
