import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `ai_plan_suggestions` — the store for AI-proposed training and
 * nutrition plans between generation and the coach's decision.
 *
 * <h2>Why every statement is guarded</h2>
 *
 * Every deployed environment currently runs with `DB_SYNCHRONIZE=true`, so
 * TypeORM will have created this table from the entity before anyone runs
 * `migration:run`. An unguarded `CREATE TABLE` would fail there, which would
 * make this migration something you can only ever run on a fresh database —
 * exactly the property that leaves a schema undocumented.
 *
 * Written this way it is a no-op against a synchronized database and does the
 * full job against a fresh one, so it stays correct through the eventual switch
 * to `synchronize: false` instead of being invalidated by it.
 *
 * The definitions below mirror what synchronize produces from
 * {@link ../ai/entities/ai-plan-suggestion.entity.ts} exactly. If you change the
 * entity, change this too — until synchronize is off, nothing checks that for
 * you.
 */
export class CreateAiPlanSuggestions1786848783258
	implements MigrationInterface
{
	name = 'CreateAiPlanSuggestions1786848783258';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// TypeORM's uuid primary keys default to uuid_generate_v4(); synchronize
		// installs this itself, a fresh migration-only database has to be told.
		await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_plan_suggestion_kind') THEN
					CREATE TYPE "ai_plan_suggestion_kind" AS ENUM ('training', 'nutrition');
				END IF;
				IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_plan_suggestion_status') THEN
					CREATE TYPE "ai_plan_suggestion_status" AS ENUM (
						'pending', 'ready', 'invalid', 'failed', 'accepted', 'declined'
					);
				END IF;
			END
			$$;
		`);

		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "ai_plan_suggestions" (
				"id"                  uuid NOT NULL DEFAULT uuid_generate_v4(),
				"tenant_id"           uuid NOT NULL,
				"membership_id"       uuid NOT NULL,
				"requested_by"        uuid NOT NULL,
				"request_id"          uuid NOT NULL,
				"kind"                "ai_plan_suggestion_kind" NOT NULL,
				"status"              "ai_plan_suggestion_status" NOT NULL DEFAULT 'pending',
				"input_snapshot"      jsonb NOT NULL,
				"plan"                jsonb,
				"warnings"            jsonb NOT NULL DEFAULT '[]'::jsonb,
				"error"               text,
				"model_meta"          jsonb,
				"created_program_id"  uuid,
				"created_plan_id"     uuid,
				"decline_reason"      text,
				"created_at"          timestamptz NOT NULL DEFAULT now(),
				"decided_at"          timestamptz,
				CONSTRAINT "PK_ai_plan_suggestions" PRIMARY KEY ("id")
			)
		`);

		// Guarded by COLUMN, not by name. synchronize names foreign keys from a
		// hash of their definition — `FK_a4bb72757c0b15aac820c660e64` — so a
		// name-based check would never match the one it already created and would
		// happily add a second, redundant key to the same column.
		await this.addForeignKey(
			queryRunner,
			'tenant_id',
			'FK_ai_plan_suggestions_tenant',
			`REFERENCES "tenants"("id") ON DELETE CASCADE`,
		);
		await this.addForeignKey(
			queryRunner,
			'membership_id',
			'FK_ai_plan_suggestions_membership',
			`REFERENCES "memberships"("id") ON DELETE RESTRICT`,
		);
		await this.addForeignKey(
			queryRunner,
			'requested_by',
			'FK_ai_plan_suggestions_requested_by',
			`REFERENCES "coaches"("id")`,
		);
		await this.addForeignKey(
			queryRunner,
			'created_program_id',
			'FK_ai_plan_suggestions_program',
			`REFERENCES "programs"("id") ON DELETE SET NULL`,
		);
		await this.addForeignKey(
			queryRunner,
			'created_plan_id',
			'FK_ai_plan_suggestions_plan',
			`REFERENCES "nutrition_plans"("id") ON DELETE SET NULL`,
		);

		// Checks carry explicit names from the entity's @Check decorators, so
		// synchronize and this migration agree and a name lookup is exact.
		await this.addCheck(
			queryRunner,
			'ck_ai_plan_suggestions_accepted_result',
			`("status" <> 'accepted' AND "created_program_id" IS NULL AND "created_plan_id" IS NULL)
			 OR ("status" = 'accepted' AND "kind" = 'training' AND "created_program_id" IS NOT NULL AND "created_plan_id" IS NULL)
			 OR ("status" = 'accepted' AND "kind" = 'nutrition' AND "created_plan_id" IS NOT NULL AND "created_program_id" IS NULL)`,
		);
		await this.addCheck(
			queryRunner,
			'ck_ai_plan_suggestions_ready_has_plan',
			`"status" NOT IN ('ready', 'accepted') OR "plan" IS NOT NULL`,
		);
		await this.addCheck(
			queryRunner,
			'ck_ai_plan_suggestions_decided_at',
			`("status" IN ('accepted', 'declined')) = ("decided_at" IS NOT NULL)`,
		);

		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "ux_ai_plan_suggestions_request"
				ON "ai_plan_suggestions" ("request_id")
		`);
		// The list endpoint: one client's suggestions, newest first.
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "ix_ai_plan_suggestions_membership"
				ON "ai_plan_suggestions" ("tenant_id", "membership_id", "created_at")
		`);
		// Finding what is still pending, and the rate-limit count.
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "ix_ai_plan_suggestions_status"
				ON "ai_plan_suggestions" ("tenant_id", "status")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE IF EXISTS "ai_plan_suggestions"`);
		await queryRunner.query(`DROP TYPE IF EXISTS "ai_plan_suggestion_status"`);
		await queryRunner.query(`DROP TYPE IF EXISTS "ai_plan_suggestion_kind"`);
	}

	/**
	 * Adds a check constraint unless one of that name is already present.
	 * `ADD CONSTRAINT` has no `IF NOT EXISTS`, so ask pg_constraint first.
	 */
	private async addCheck(
		queryRunner: QueryRunner,
		name: string,
		expression: string,
	): Promise<void> {
		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conrelid = to_regclass('public.ai_plan_suggestions')
					  AND conname = '${name}'
				) THEN
					ALTER TABLE "ai_plan_suggestions"
						ADD CONSTRAINT "${name}" CHECK (${expression});
				END IF;
			END
			$$;
		`);
	}

	/**
	 * Adds a foreign key unless the column already has one, whatever it is called.
	 *
	 * Postgres does not reject a duplicate foreign key — it just enforces the same
	 * rule twice, on every write, forever. Checking the column rather than the name
	 * is what makes this safe to run after synchronize has already been through.
	 */
	private async addForeignKey(
		queryRunner: QueryRunner,
		column: string,
		name: string,
		reference: string,
	): Promise<void> {
		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1
					FROM pg_constraint c
					JOIN pg_attribute a
						ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
					WHERE c.conrelid = to_regclass('public.ai_plan_suggestions')
					  AND c.contype = 'f'
					  AND array_length(c.conkey, 1) = 1
					  AND a.attname = '${column}'
				) THEN
					ALTER TABLE "ai_plan_suggestions"
						ADD CONSTRAINT "${name}" FOREIGN KEY ("${column}") ${reference};
				END IF;
			END
			$$;
		`);
	}
}
