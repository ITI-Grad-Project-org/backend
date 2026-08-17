import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import {
	DietaryPreference,
	numericTransformer,
	ServingUnit,
} from '../../../common';

/**
 * System starter set for the food library — the nutrition counterpart of
 * {@link ../../../exercises/entities/default-exercise.entity.ts}. Maintained via
 * migrations, never exposed to coach-facing endpoints. Its only job is to be
 * COPIED into a tenant's `foods` table.
 *
 * <h2>Why this has to exist in Postgres</h2>
 *
 * `planned_meal_foods.source_food_id` is a NOT NULL foreign key. A food that
 * exists only as an embedding in the vector store cannot be selected by plan
 * generation and could not be saved if it were — the knowledge base is what the
 * assistant reads to answer questions, not what a plan is built from.
 */
@Entity('default_foods')
@Index('ux_default_foods_name_brand', ['name', 'brand'], { unique: true })
@Check('ck_default_foods_serving_size', `"serving_size" > 0`)
@Check(
	'ck_default_foods_non_negative_nutrients',
	`"calories" >= 0 AND "protein_g" >= 0 AND "carbs_g" >= 0 AND "fat_g" >= 0 AND ("fiber_g" IS NULL OR "fiber_g" >= 0)`,
)
export class DefaultFood {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ length: 150 })
	name: string;

	@Column({ length: 100, nullable: true })
	brand: string | null;

	@Column({
		name: 'serving_size',
		type: 'numeric',
		precision: 8,
		scale: 2,
		transformer: numericTransformer,
	})
	servingSize: number;

	@Column({
		name: 'serving_unit',
		type: 'enum',
		enum: ServingUnit,
		enumName: 'serving_unit',
	})
	servingUnit: ServingUnit;

	@Column({
		type: 'numeric',
		precision: 8,
		scale: 2,
		transformer: numericTransformer,
	})
	calories: number;

	@Column({
		name: 'protein_g',
		type: 'numeric',
		precision: 7,
		scale: 2,
		transformer: numericTransformer,
	})
	proteinG: number;

	@Column({
		name: 'carbs_g',
		type: 'numeric',
		precision: 7,
		scale: 2,
		transformer: numericTransformer,
	})
	carbsG: number;

	@Column({
		name: 'fat_g',
		type: 'numeric',
		precision: 7,
		scale: 2,
		transformer: numericTransformer,
	})
	fatG: number;

	@Column({
		name: 'fiber_g',
		type: 'numeric',
		precision: 7,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	fiberG: number | null;

	@Column({
		name: 'dietary_tags',
		type: 'enum',
		enum: DietaryPreference,
		enumName: 'dietary_preference',
		array: true,
		default: '{}',
	})
	dietaryTags: DietaryPreference[];

	/**
	 * Free text, matched case-insensitively against a client's intake allergies.
	 * Keep these to the common allergen words a coach would actually type.
	 */
	@Column({ type: 'text', array: true, default: '{}' })
	allergens: string[];

	/** FALSE = stop copying into NEW tenants; existing copies are untouched. */
	@Column({ name: 'is_active', default: true })
	isActive: boolean;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
