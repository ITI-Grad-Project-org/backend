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
import { Food } from './food.entity';
import { Meal } from './meal.entity';

@Entity('meal_ingredients')
@Unique(['mealId', 'position'])
@Index('ix_meal_ingredients_meal', ['mealId'])
@Check('ck_meal_ingredients_amount', `"amount" > 0`)
@Check('ck_meal_ingredients_position', `"position" >= 1`)
export class MealIngredient {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'meal_id', type: 'uuid' })
	mealId: string;

	@ManyToOne(() => Meal, (meal) => meal.ingredients, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'meal_id' })
	meal: Meal;

	@Column({ name: 'food_id', type: 'uuid' })
	foodId: string;

	@ManyToOne(() => Food, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'food_id' })
	food: Food;

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
