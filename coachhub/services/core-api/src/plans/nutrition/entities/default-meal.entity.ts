import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { DietaryPreference } from '../../../common';
import { DefaultMealIngredient } from './default-meal-ingredient.entity';

/**
 * System starter set for the meal library, copied into a tenant's `meals` table.
 *
 * A meal is the unit a nutrition plan is built from — `planned_meals.source_meal_id`
 * is NOT NULL — so without a meal library the model has nothing to select and can
 * only ever return macro targets with empty days.
 */
@Entity('default_meals')
@Index('ux_default_meals_name', ['name'], { unique: true })
export class DefaultMeal {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ length: 150 })
	name: string;

	@Column({ type: 'text', nullable: true })
	description: string | null;

	@Column({ name: 'prep_notes', type: 'text', nullable: true })
	prepNotes: string | null;

	@Column({
		name: 'dietary_tags',
		type: 'enum',
		enum: DietaryPreference,
		enumName: 'dietary_preference',
		array: true,
		default: '{}',
	})
	dietaryTags: DietaryPreference[];

	/** Only what the meal adds beyond its ingredients — a sauce, a garnish. */
	@Column({ type: 'text', array: true, default: '{}' })
	allergens: string[];

	@Column({ name: 'is_active', default: true })
	isActive: boolean;

	@OneToMany(() => DefaultMealIngredient, (ingredient) => ingredient.meal, {
		cascade: ['insert'],
	})
	ingredients: DefaultMealIngredient[];

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
