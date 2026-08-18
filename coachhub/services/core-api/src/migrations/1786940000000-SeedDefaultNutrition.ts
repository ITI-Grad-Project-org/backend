import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the system starter set for the nutrition library and seeds it.
 *
 * <h2>Why this is in Postgres and not the vector store</h2>
 *
 * `planned_meals.source_meal_id` and `planned_meal_foods.source_food_id` are NOT
 * NULL foreign keys, so a plan is assembled from rows in `meals` and `foods` and
 * from nothing else. A meal that existed only as an embedding could not be
 * offered to the model as a candidate, and could not be saved if it were — the
 * knowledge base answers questions, it does not supply plan ingredients.
 *
 * The RAG ingest reads these tables anyway, so seeding here puts the same meals
 * into the vector store on its next tick without anyone writing to Atlas by hand
 * — which would not survive regardless, because the ingest prunes whatever
 * `core_db` did not produce.
 *
 * <h2>Order matters</h2>
 *
 * Foods first, then meals, then the ingredient rows that join them. Copying a
 * meal into a tenant resolves each ingredient through the tenant's own `foods`
 * row by `source_seed_id`, so a meal whose ingredients were never copied cannot
 * be copied either.
 *
 * Plain strings rather than the app's enums throughout: a migration records what
 * was done on a given day, and importing an enum that later changes would
 * rewrite that history.
 */
type SeedFood = [
	name: string,
	brand: string | null,
	servingSize: number,
	servingUnit: string,
	calories: number,
	proteinG: number,
	carbsG: number,
	fatG: number,
	fiberG: number | null,
	dietaryTags: string[],
	allergens: string[],
];

type SeedMeal = [
	name: string,
	description: string,
	prepNotes: string,
	dietaryTags: string[],
	allergens: string[],
	ingredients: Array<[foodName: string, amount: number]>,
];

/**
 * Everyday foods a coach would actually reach for, with per-serving macros.
 *
 * Allergens are the common words a coach types into an intake form, matched
 * case-insensitively against a client's allergies — plan generation removes any
 * meal carrying one before the model ever sees it.
 */
const DEFAULT_FOODS: ReadonlyArray<SeedFood> = [
	[
		'Chicken Breast, skinless',
		'raw',
		100,
		'g',
		165,
		31,
		0,
		3.6,
		0,
		['halal', 'kosher'],
		[],
	],
	[
		'Beef Mince, 5% fat',
		'raw',
		100,
		'g',
		137,
		21,
		0,
		5,
		0,
		['halal', 'kosher'],
		[],
	],
	[
		'Salmon Fillet',
		'raw',
		100,
		'g',
		208,
		20,
		0,
		13,
		0,
		['pescatarian'],
		['fish'],
	],
	[
		'Tuna, canned in water',
		null,
		100,
		'g',
		116,
		26,
		0,
		1,
		0,
		['pescatarian'],
		['fish'],
	],
	[
		'Whole Egg',
		null,
		1,
		'piece',
		72,
		6.3,
		0.4,
		4.8,
		0,
		['vegetarian'],
		['egg'],
	],
	['Egg White', null, 100, 'g', 52, 11, 0.7, 0.2, 0, ['vegetarian'], ['egg']],
	[
		'Greek Yogurt, 0% fat',
		null,
		100,
		'g',
		59,
		10,
		3.6,
		0.4,
		0,
		['vegetarian'],
		['milk'],
	],
	[
		'Cottage Cheese, low fat',
		null,
		100,
		'g',
		72,
		12,
		3.4,
		1,
		0,
		['vegetarian'],
		['milk'],
	],
	[
		'Whey Protein Isolate',
		null,
		30,
		'scoop',
		113,
		25,
		2,
		0.5,
		0,
		['vegetarian'],
		['milk'],
	],
	[
		'Firm Tofu',
		null,
		100,
		'g',
		144,
		15,
		3.9,
		8.7,
		2.3,
		['vegan', 'vegetarian'],
		['soy'],
	],
	[
		'Tempeh',
		null,
		100,
		'g',
		192,
		20,
		7.6,
		11,
		null,
		['vegan', 'vegetarian'],
		['soy'],
	],
	[
		'Red Lentils, dry',
		null,
		100,
		'g',
		352,
		25,
		60,
		1.1,
		11,
		['vegan', 'vegetarian'],
		[],
	],
	[
		'Chickpeas, canned drained',
		null,
		100,
		'g',
		139,
		7.4,
		22,
		2.6,
		6.4,
		['vegan', 'vegetarian'],
		[],
	],
	[
		'Black Beans, canned drained',
		null,
		100,
		'g',
		132,
		8.9,
		24,
		0.5,
		8.7,
		['vegan', 'vegetarian'],
		[],
	],
	[
		'Prawns',
		'raw',
		100,
		'g',
		99,
		24,
		0.2,
		0.3,
		0,
		['pescatarian'],
		['shellfish'],
	],
	[
		'White Rice, dry',
		null,
		100,
		'g',
		360,
		7,
		79,
		0.6,
		1.3,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Brown Rice, dry',
		null,
		100,
		'g',
		370,
		7.9,
		77,
		2.9,
		3.5,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Rolled Oats',
		null,
		100,
		'g',
		379,
		13,
		67,
		6.5,
		10,
		['vegetarian', 'vegan'],
		['gluten'],
	],
	[
		'Wholemeal Bread',
		null,
		1,
		'piece',
		82,
		4,
		14,
		1.1,
		2,
		['vegetarian', 'vegan'],
		['gluten', 'wheat'],
	],
	[
		'Pasta, dry',
		null,
		100,
		'g',
		371,
		13,
		75,
		1.5,
		3.2,
		['vegetarian', 'vegan'],
		['gluten', 'wheat'],
	],
	[
		'Potato',
		'raw',
		100,
		'g',
		77,
		2,
		17,
		0.1,
		2.2,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Sweet Potato',
		'raw',
		100,
		'g',
		86,
		1.6,
		20,
		0.1,
		3,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Quinoa, dry',
		null,
		100,
		'g',
		368,
		14,
		64,
		6.1,
		7,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Couscous, dry',
		null,
		100,
		'g',
		376,
		13,
		77,
		0.6,
		5,
		['vegetarian', 'vegan'],
		['gluten', 'wheat'],
	],
	[
		'Banana',
		null,
		1,
		'piece',
		105,
		1.3,
		27,
		0.4,
		3.1,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Apple',
		null,
		1,
		'piece',
		95,
		0.5,
		25,
		0.3,
		4.4,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Blueberries',
		null,
		100,
		'g',
		57,
		0.7,
		14,
		0.3,
		2.4,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Dates, pitted',
		null,
		100,
		'g',
		282,
		2.5,
		75,
		0.4,
		8,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Olive Oil',
		'extra virgin',
		1,
		'tbsp',
		119,
		0,
		0,
		13.5,
		0,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Almonds',
		null,
		100,
		'g',
		579,
		21,
		22,
		50,
		12.5,
		['vegan', 'vegetarian', 'gluten_free'],
		['tree nuts'],
	],
	[
		'Peanut Butter',
		'no added sugar',
		1,
		'tbsp',
		94,
		4,
		3.1,
		8,
		0.9,
		['vegan', 'vegetarian'],
		['peanuts'],
	],
	[
		'Avocado',
		null,
		100,
		'g',
		160,
		2,
		8.5,
		15,
		6.7,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Tahini',
		null,
		1,
		'tbsp',
		89,
		2.6,
		3.2,
		8,
		1.4,
		['vegan', 'vegetarian', 'gluten_free'],
		['sesame'],
	],
	[
		'Chia Seeds',
		null,
		100,
		'g',
		486,
		17,
		42,
		31,
		34,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Broccoli',
		'raw',
		100,
		'g',
		34,
		2.8,
		7,
		0.4,
		2.6,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Spinach',
		'raw',
		100,
		'g',
		23,
		2.9,
		3.6,
		0.4,
		2.2,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Mixed Salad Leaves',
		null,
		100,
		'g',
		17,
		1.4,
		2.9,
		0.2,
		2,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Tomato',
		null,
		100,
		'g',
		18,
		0.9,
		3.9,
		0.2,
		1.2,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Cucumber',
		null,
		100,
		'g',
		15,
		0.7,
		3.6,
		0.1,
		0.5,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Red Onion',
		null,
		100,
		'g',
		40,
		1.1,
		9.3,
		0.1,
		1.7,
		['vegan', 'vegetarian', 'gluten_free'],
		[],
	],
	[
		'Semi-skimmed Milk',
		null,
		250,
		'ml',
		125,
		8.5,
		12,
		4.3,
		0,
		['vegetarian'],
		['milk'],
	],
	[
		'Unsweetened Almond Milk',
		null,
		250,
		'ml',
		32,
		1.1,
		0.8,
		2.9,
		0.8,
		['vegan', 'vegetarian'],
		['tree nuts'],
	],
];

/**
 * Complete meals, because a meal is the unit a plan is built from. Weighted
 * towards things that survive a working day: batch cooking, packed lunches,
 * and two shakes for clients who cannot face food early.
 */
const DEFAULT_MEALS: ReadonlyArray<SeedMeal> = [
	[
		'Grilled Chicken, Rice and Broccoli',
		'A plain high-protein staple that scales to almost any calorie target.',
		'Season the chicken simply. Weigh the rice dry.',
		['halal', 'gluten_free'],
		[],
		[
			['Chicken Breast, skinless', 180],
			['White Rice, dry', 75],
			['Broccoli', 150],
			['Olive Oil', 1],
		],
	],
	[
		'Overnight Oats with Whey',
		'Made the night before; travels well and needs no cooking.',
		'Combine and refrigerate overnight. Add the berries in the morning.',
		['vegetarian'],
		[],
		[
			['Rolled Oats', 60],
			['Whey Protein Isolate', 1],
			['Semi-skimmed Milk', 250],
			['Blueberries', 80],
		],
	],
	[
		'Salmon, Sweet Potato and Spinach',
		"Oily fish for the week's omega-3, with a slower carb source.",
		'Roast the sweet potato whole; wilt the spinach in the pan after the salmon.',
		['pescatarian', 'gluten_free'],
		[],
		[
			['Salmon Fillet', 150],
			['Sweet Potato', 250],
			['Spinach', 100],
			['Olive Oil', 1],
		],
	],
	[
		'Greek Yogurt, Berries and Almonds',
		'A high-protein breakfast or a late snack.',
		'Nothing to cook.',
		['vegetarian', 'gluten_free'],
		[],
		[
			['Greek Yogurt, 0% fat', 250],
			['Blueberries', 100],
			['Almonds', 20],
			['Dates, pitted', 20],
		],
	],
	[
		'Beef Mince and Pasta',
		'Everyday comfort food that still hits a protein target.',
		'Brown the mince first, then add the sauce and cooked pasta.',
		['halal'],
		[],
		[
			['Beef Mince, 5% fat', 150],
			['Pasta, dry', 90],
			['Tomato', 150],
			['Olive Oil', 1],
		],
	],
	[
		'Tofu and Quinoa Bowl',
		'A complete plant-based meal with a full amino-acid profile.',
		'Press the tofu before frying so it crisps rather than steams.',
		['vegan', 'vegetarian', 'gluten_free'],
		[],
		[
			['Firm Tofu', 200],
			['Quinoa, dry', 70],
			['Broccoli', 120],
			['Tahini', 1],
		],
	],
	[
		'Three-Egg Omelette with Toast',
		'Fast, cheap and hard to get wrong.',
		'Cook on a medium heat; take it off while it still looks slightly wet.',
		['vegetarian'],
		[],
		[
			['Whole Egg', 3],
			['Wholemeal Bread', 2],
			['Spinach', 60],
			['Olive Oil', 1],
		],
	],
	[
		'Tuna Salad',
		'No cooking at all — a lunch for a day away from a kitchen.',
		'Dress just before eating so the leaves keep their bite.',
		['pescatarian', 'gluten_free'],
		[],
		[
			['Tuna, canned in water', 150],
			['Mixed Salad Leaves', 100],
			['Cucumber', 100],
			['Tomato', 100],
			['Olive Oil', 1],
		],
	],
	[
		'Lentil and Chickpea Stew',
		'Batch-cooks well and reheats better than it starts.',
		'Simmer 25 minutes. Makes two portions; this is one.',
		['vegan', 'vegetarian', 'gluten_free'],
		[],
		[
			['Red Lentils, dry', 80],
			['Chickpeas, canned drained', 120],
			['Tomato', 200],
			['Red Onion', 80],
			['Olive Oil', 1],
		],
	],
	[
		'Chicken Couscous with Salad',
		'A packed lunch that does not need reheating.',
		'Pour boiling water over the couscous, cover for five minutes, fork through.',
		['halal'],
		[],
		[
			['Chicken Breast, skinless', 150],
			['Couscous, dry', 70],
			['Cucumber', 100],
			['Tomato', 100],
		],
	],
	[
		'Peanut Butter Banana Toast',
		'A pre-training snack that digests quickly.',
		'Eat 60-90 minutes before training.',
		['vegetarian', 'vegan'],
		[],
		[
			['Wholemeal Bread', 2],
			['Peanut Butter', 2],
			['Banana', 1],
		],
	],
	[
		'Cottage Cheese and Fruit',
		'Slow-digesting protein; a good last meal of the day.',
		'Nothing to cook.',
		['vegetarian', 'gluten_free'],
		[],
		[
			['Cottage Cheese, low fat', 200],
			['Apple', 1],
			['Almonds', 15],
		],
	],
	[
		'Prawn and Rice Stir-fry',
		'On the table in fifteen minutes.',
		'Cook the rice ahead. Prawns need two minutes, no more.',
		['pescatarian', 'gluten_free'],
		[],
		[
			['Prawns', 180],
			['White Rice, dry', 75],
			['Broccoli', 120],
			['Red Onion', 60],
			['Olive Oil', 1],
		],
	],
	[
		'Tempeh and Black Bean Bowl',
		'A dense plant-based meal for a muscle-gain phase.',
		'Steam the tempeh for ten minutes first to soften its bitterness.',
		['vegan', 'vegetarian', 'gluten_free'],
		[],
		[
			['Tempeh', 150],
			['Black Beans, canned drained', 150],
			['Brown Rice, dry', 70],
			['Avocado', 70],
		],
	],
	[
		'Protein Oat Shake',
		'For a client who cannot face solid food early.',
		'Blend. Add ice if it is too thick.',
		['vegetarian'],
		[],
		[
			['Rolled Oats', 50],
			['Whey Protein Isolate', 1],
			['Banana', 1],
			['Unsweetened Almond Milk', 250],
			['Peanut Butter', 1],
		],
	],
	[
		'Egg White Scramble with Avocado',
		'High protein, low calorie — useful deep into a cut.',
		'Season well; egg whites need it.',
		['vegetarian', 'gluten_free'],
		[],
		[
			['Egg White', 200],
			['Avocado', 60],
			['Spinach', 80],
			['Tomato', 100],
		],
	],
];

export class SeedDefaultNutrition1786940000000 implements MigrationInterface {
	name = 'SeedDefaultNutrition1786940000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "default_foods" (
				"id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
				"name"          character varying(150) NOT NULL,
				"brand"         character varying(100),
				"serving_size"  numeric(8,2) NOT NULL,
				"serving_unit"  "serving_unit" NOT NULL,
				"calories"      numeric(8,2) NOT NULL,
				"protein_g"     numeric(7,2) NOT NULL,
				"carbs_g"       numeric(7,2) NOT NULL,
				"fat_g"         numeric(7,2) NOT NULL,
				"fiber_g"       numeric(7,2),
				"dietary_tags"  "dietary_preference"[] NOT NULL DEFAULT '{}',
				"allergens"     text[] NOT NULL DEFAULT '{}',
				"is_active"     boolean NOT NULL DEFAULT true,
				"created_at"    timestamptz NOT NULL DEFAULT now(),
				"updated_at"    timestamptz NOT NULL DEFAULT now(),
				CONSTRAINT "PK_default_foods" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "default_meals" (
				"id"           uuid NOT NULL DEFAULT uuid_generate_v4(),
				"name"         character varying(150) NOT NULL,
				"description"  text,
				"prep_notes"   text,
				"dietary_tags" "dietary_preference"[] NOT NULL DEFAULT '{}',
				"allergens"    text[] NOT NULL DEFAULT '{}',
				"is_active"    boolean NOT NULL DEFAULT true,
				"created_at"   timestamptz NOT NULL DEFAULT now(),
				"updated_at"   timestamptz NOT NULL DEFAULT now(),
				CONSTRAINT "PK_default_meals" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "default_meal_ingredients" (
				"id"       uuid NOT NULL DEFAULT uuid_generate_v4(),
				"meal_id"  uuid NOT NULL,
				"food_id"  uuid NOT NULL,
				"amount"   numeric(8,2) NOT NULL,
				"position" smallint NOT NULL,
				CONSTRAINT "PK_default_meal_ingredients" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS "ux_default_foods_name_brand" ON "default_foods" ("name", "brand")`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS "ux_default_meals_name" ON "default_meals" ("name")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "ix_default_meal_ingredients_meal" ON "default_meal_ingredients" ("meal_id")`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS "ux_default_meal_ingredients_position" ON "default_meal_ingredients" ("meal_id", "position")`,
		);

		await this.addConstraint(
			queryRunner,
			'default_foods',
			'ck_default_foods_serving_size',
			`CHECK ("serving_size" > 0)`,
		);
		await this.addConstraint(
			queryRunner,
			'default_foods',
			'ck_default_foods_non_negative_nutrients',
			`CHECK ("calories" >= 0 AND "protein_g" >= 0 AND "carbs_g" >= 0 AND "fat_g" >= 0 AND ("fiber_g" IS NULL OR "fiber_g" >= 0))`,
		);
		await this.addConstraint(
			queryRunner,
			'default_meal_ingredients',
			'ck_default_meal_ingredients_amount',
			`CHECK ("amount" > 0)`,
		);
		await this.addConstraint(
			queryRunner,
			'default_meal_ingredients',
			'ck_default_meal_ingredients_position',
			`CHECK ("position" >= 1)`,
		);
		await this.addConstraint(
			queryRunner,
			'default_meal_ingredients',
			'FK_default_meal_ingredients_meal',
			`FOREIGN KEY ("meal_id") REFERENCES "default_meals"("id") ON DELETE CASCADE`,
		);
		await this.addConstraint(
			queryRunner,
			'default_meal_ingredients',
			'FK_default_meal_ingredients_food',
			`FOREIGN KEY ("food_id") REFERENCES "default_foods"("id") ON DELETE RESTRICT`,
		);

		// Lineage on the tenant-owned tables, mirroring exercises.source_seed_id. It
		// is what makes a re-copy a no-op and what resolves a starter meal's
		// ingredients to this tenant's own food rows.
		await queryRunner.query(
			`ALTER TABLE "foods" ADD COLUMN IF NOT EXISTS "source_seed_id" uuid`,
		);
		await queryRunner.query(
			`ALTER TABLE "meals" ADD COLUMN IF NOT EXISTS "source_seed_id" uuid`,
		);
		await this.addConstraint(
			queryRunner,
			'foods',
			'FK_foods_source_seed',
			`FOREIGN KEY ("source_seed_id") REFERENCES "default_foods"("id") ON DELETE SET NULL`,
		);
		await this.addConstraint(
			queryRunner,
			'meals',
			'FK_meals_source_seed',
			`FOREIGN KEY ("source_seed_id") REFERENCES "default_meals"("id") ON DELETE SET NULL`,
		);

		await this.seedFoods(queryRunner);
		await this.seedMeals(queryRunner);
	}

	private async seedFoods(queryRunner: QueryRunner): Promise<void> {
		const columns = 11;
		const values = DEFAULT_FOODS.map((_, row) => {
			const o = row * columns;
			return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}::serving_unit, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10}::dietary_preference[], $${o + 11}::text[], TRUE)`;
		}).join(',\n\t\t\t\t');

		await queryRunner.query(
			`INSERT INTO "default_foods"
				("name", "brand", "serving_size", "serving_unit", "calories", "protein_g",
				 "carbs_g", "fat_g", "fiber_g", "dietary_tags", "allergens", "is_active")
			 VALUES
				${values}
			 ON CONFLICT ("name", "brand") DO NOTHING`,
			DEFAULT_FOODS.flat(),
		);
	}

	/**
	 * Meals and their ingredients, resolving each food by name so the seed data
	 * stays readable instead of carrying generated uuids around.
	 */
	private async seedMeals(queryRunner: QueryRunner): Promise<void> {
		for (const [
			name,
			description,
			prepNotes,
			dietaryTags,
			allergens,
			ingredients,
		] of DEFAULT_MEALS) {
			const inserted: Array<{ id: string }> = await queryRunner.query(
				`INSERT INTO "default_meals"
					("name", "description", "prep_notes", "dietary_tags", "allergens", "is_active")
				 VALUES ($1, $2, $3, $4::dietary_preference[], $5::text[], TRUE)
				 ON CONFLICT ("name") DO NOTHING
				 RETURNING "id"`,
				[name, description, prepNotes, dietaryTags, allergens],
			);

			// Empty when the meal was already there, which makes a re-run a no-op
			// rather than a pile of duplicate ingredient rows.
			const mealId = inserted[0]?.id;
			if (!mealId) {
				continue;
			}

			for (const [index, [foodName, amount]] of ingredients.entries()) {
				await queryRunner.query(
					`INSERT INTO "default_meal_ingredients" ("meal_id", "food_id", "amount", "position")
					 SELECT $1, f."id", $2, $3 FROM "default_foods" f WHERE f."name" = $4`,
					[mealId, amount, index + 1, foodName],
				);
			}
		}
	}

	/** `ADD CONSTRAINT` has no `IF NOT EXISTS`, so ask pg_constraint first. */
	private async addConstraint(
		queryRunner: QueryRunner,
		table: string,
		name: string,
		definition: string,
	): Promise<void> {
		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conrelid = to_regclass('public.${table}') AND conname = '${name}'
				) THEN
					ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${definition};
				END IF;
			END
			$$;
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// A tenant's copies are theirs. source_seed_id is ON DELETE SET NULL exactly
		// so dropping the starter set never touches a coach's own library.
		await queryRunner.query(
			`ALTER TABLE "meals" DROP COLUMN IF EXISTS "source_seed_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "foods" DROP COLUMN IF EXISTS "source_seed_id"`,
		);
		await queryRunner.query(`DROP TABLE IF EXISTS "default_meal_ingredients"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "default_meals"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "default_foods"`);
	}
}
