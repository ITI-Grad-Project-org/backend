import { MigrationInterface, QueryRunner } from 'typeorm';
import { DEFAULT_EXERCISE_CATALOG } from '../exercises/default-exercise.catalog';

export class SeedDefaultExercises1784592000000 implements MigrationInterface {
	name = 'SeedDefaultExercises1784592000000';

	async up(queryRunner: QueryRunner): Promise<void> {
		await this.assertRequiredTablesExist(queryRunner);

		// Block tenant inserts briefly so a registration cannot commit between the
		// catalog seed and the existing-tenant backfill.
		await queryRunner.query('LOCK TABLE tenants IN SHARE MODE');

		for (const exercise of DEFAULT_EXERCISE_CATALOG) {
			const parameters = [
				exercise.name,
				exercise.category,
				exercise.primaryMuscle,
				[...exercise.secondaryMuscles],
				[...exercise.equipment],
				exercise.demoVideoUrl,
				exercise.demoGifUrl,
				exercise.thumbnailUrl,
				[...exercise.instructionSteps],
			];

			await queryRunner.query(
				`UPDATE default_exercises
				 SET name = $1,
				     category = $2::exercise_category,
				     primary_muscle = $3::muscle_group,
				     secondary_muscles = $4::muscle_group[],
				     equipment = $5::equipment_type[],
				     demo_video_url = $6,
				     demo_gif_url = $7,
				     thumbnail_url = $8,
				     instruction_steps = $9,
				     is_active = TRUE,
				     updated_at = NOW()
				 WHERE LOWER(name) = LOWER($1)
				 RETURNING id`,
				parameters,
			);

			await queryRunner.query(
				`INSERT INTO default_exercises
				 (name, category, primary_muscle, secondary_muscles, equipment,
				  demo_video_url, demo_gif_url, thumbnail_url, instruction_steps,
				  is_active)
				 SELECT
				 $1::varchar, $2::exercise_category, $3::muscle_group, $4::muscle_group[],
				 $5::equipment_type[], $6, $7, $8, $9, TRUE
				 WHERE NOT EXISTS (
				   SELECT 1
				   FROM default_exercises
				   WHERE LOWER(name) = LOWER($1::varchar)
				 )
				 ON CONFLICT (name) DO UPDATE
				 SET category = EXCLUDED.category,
				     primary_muscle = EXCLUDED.primary_muscle,
				     secondary_muscles = EXCLUDED.secondary_muscles,
				     equipment = EXCLUDED.equipment,
				     demo_video_url = EXCLUDED.demo_video_url,
				     demo_gif_url = EXCLUDED.demo_gif_url,
				     thumbnail_url = EXCLUDED.thumbnail_url,
				     instruction_steps = EXCLUDED.instruction_steps,
				     is_active = TRUE,
				     updated_at = NOW()`,
				parameters,
			);
		}

		await queryRunner.query(
			`INSERT INTO exercises
			 (tenant_id, source_seed_id, created_by, name, category,
			  primary_muscle, secondary_muscles, equipment, demo_video_url,
			  demo_gif_url, thumbnail_url, instruction_steps, is_active)
			 SELECT tenant.id,
			        seed.id,
			        NULL,
			        seed.name,
			        seed.category,
			        seed.primary_muscle,
			        seed.secondary_muscles,
			        seed.equipment,
			        seed.demo_video_url,
			        seed.demo_gif_url,
			        seed.thumbnail_url,
			        seed.instruction_steps,
			        TRUE
			 FROM tenants tenant
			 CROSS JOIN default_exercises seed
			 WHERE seed.is_active
			   AND NOT EXISTS (
			     SELECT 1
			     FROM exercises existing
			     WHERE existing.tenant_id = tenant.id
			       AND (
			         existing.source_seed_id = seed.id
			         OR LOWER(existing.name) = LOWER(seed.name)
			       )
			   )
			 ON CONFLICT (tenant_id, name) DO NOTHING`,
		);
	}

	async down(): Promise<void> {
		throw new Error(
			'The default exercise catalog migration is irreversible because tenant exercise copies may already be in use.',
		);
	}

	private async assertRequiredTablesExist(queryRunner: QueryRunner) {
		const requiredTables = ['tenants', 'default_exercises', 'exercises'];

		for (const tableName of requiredTables) {
			if (!(await queryRunner.hasTable(tableName))) {
				throw new Error(
					`Cannot seed default exercises: required table "${tableName}" does not exist.`,
				);
			}
		}
	}
}
