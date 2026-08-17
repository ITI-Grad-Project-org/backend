import {
	Check,
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { numericTransformer } from '../../../common';
import { DefaultFood } from './default-food.entity';
import { DefaultMeal } from './default-meal.entity';

/**
 * What a starter meal is made of, in starter-food terms.
 *
 * The copy into a tenant resolves each of these to that tenant's own `foods` row
 * by lineage (`source_seed_id`), which is why the food library must be seeded
 * first — a meal whose ingredients have no counterpart cannot be copied.
 */
@Entity('default_meal_ingredients')
@Unique(['mealId', 'position'])
@Index('ix_default_meal_ingredients_meal', ['mealId'])
@Check('ck_default_meal_ingredients_amount', `"amount" > 0`)
@Check('ck_default_meal_ingredients_position', `"position" >= 1`)
export class DefaultMealIngredient {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'meal_id', type: 'uuid' })
	mealId: string;

	@ManyToOne(() => DefaultMeal, (meal) => meal.ingredients, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'meal_id' })
	meal: DefaultMeal;

	@Column({ name: 'food_id', type: 'uuid' })
	foodId: string;

	@ManyToOne(() => DefaultFood, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'food_id' })
	food: DefaultFood;

	@Column({
		type: 'numeric',
		precision: 8,
		scale: 2,
		transformer: numericTransformer,
	})
	amount: number;

	@Column({ type: 'smallint' })
	position: number;
}
