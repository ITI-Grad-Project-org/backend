import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens the allergen tags on the starter foods to include their common synonyms.
 *
 * Clients write allergies as prose into an intake box. A real one in this
 * database reads "Alergic to lactose", and a food tagged only `milk` does not
 * meet it halfway — so every dairy meal stayed on offer to a client who cannot
 * digest dairy.
 *
 * `PlanContextService` now matches on whole words found anywhere in what the
 * client wrote, which is the other half of the fix. This half gives it more
 * surface to land on. Neither is a substitute for a controlled allergen list at
 * intake, which is the only version of this that is reliable.
 */
const SYNONYMS: ReadonlyArray<[tag: string, addition: string[]]> = [
	['milk', ['dairy', 'lactose']],
	['egg', ['eggs']],
	['fish', ['seafood']],
	['shellfish', ['seafood', 'crustacean']],
	['peanuts', ['peanut', 'groundnut']],
	['tree nuts', ['nuts', 'tree nut']],
	['gluten', ['wheat']],
	['wheat', ['gluten']],
	['soy', ['soya', 'soybean']],
	['sesame', ['tahini']],
];

export class BroadenDefaultFoodAllergens1786941000000
	implements MigrationInterface
{
	name = 'BroadenDefaultFoodAllergens1786941000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		for (const [tag, additions] of SYNONYMS) {
			// Applied to the tenant copies as well: a coach who seeded their library
			// before this ran would otherwise keep the narrower tags forever.
			for (const table of ['default_foods', 'foods']) {
				await queryRunner.query(
					`UPDATE "${table}"
					 SET "allergens" = ARRAY(
					   SELECT DISTINCT unnest("allergens" || $1::text[])
					 )
					 WHERE $2 = ANY("allergens")`,
					[additions, tag],
				);
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		for (const [, additions] of SYNONYMS) {
			for (const table of ['default_foods', 'foods']) {
				await queryRunner.query(
					`UPDATE "${table}"
					 SET "allergens" = ARRAY(
					   SELECT a FROM unnest("allergens") a WHERE a <> ALL($1::text[])
					 )
					 WHERE "allergens" && $1::text[]`,
					[additions],
				);
			}
		}
	}
}
