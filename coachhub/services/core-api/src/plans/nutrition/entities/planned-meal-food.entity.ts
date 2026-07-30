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
import { numericTransformer, ServingUnit } from '../../../common';
import { Food } from './food.entity';
import { MealIngredient } from './meal-ingredient.entity';
import { PlannedMeal } from './planned-meal.entity';

@Entity('planned_meal_foods')
@Unique(['plannedMealId', 'position'])
@Index('ix_planned_meal_foods_meal', ['plannedMealId'])
@Check('ck_planned_meal_foods_serving_size', `"serving_size" > 0`)
@Check('ck_planned_meal_foods_amount', `"amount" > 0`)
@Check('ck_planned_meal_foods_position', `"position" >= 1`)
@Check(
	'ck_planned_meal_foods_non_negative_nutrients',
	`"calories_per_serving" >= 0 AND "protein_g_per_serving" >= 0 AND "carbs_g_per_serving" >= 0 AND "fat_g_per_serving" >= 0 AND ("fiber_g_per_serving" IS NULL OR "fiber_g_per_serving" >= 0)`,
)
export class PlannedMealFood {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'planned_meal_id', type: 'uuid' })
	plannedMealId: string;

	@ManyToOne(() => PlannedMeal, (plannedMeal) => plannedMeal.foods, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'planned_meal_id' })
	plannedMeal: PlannedMeal;

	@Column({ name: 'source_food_id', type: 'uuid' })
	sourceFoodId: string;

	@ManyToOne(() => Food, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'source_food_id' })
	sourceFood: Food;

	@Column({ name: 'source_meal_ingredient_id', type: 'uuid', nullable: true })
	sourceMealIngredientId: string | null;

	@ManyToOne(() => MealIngredient, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'source_meal_ingredient_id' })
	sourceMealIngredient: MealIngredient | null;

	@Column({ name: 'food_name', length: 150 })
	foodName: string;

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
	amount: number;

	@Column({
		name: 'calories_per_serving',
		type: 'numeric',
		precision: 8,
		scale: 2,
		transformer: numericTransformer,
	})
	caloriesPerServing: number;

	@Column({
		name: 'protein_g_per_serving',
		type: 'numeric',
		precision: 7,
		scale: 2,
		transformer: numericTransformer,
	})
	proteinGPerServing: number;

	@Column({
		name: 'carbs_g_per_serving',
		type: 'numeric',
		precision: 7,
		scale: 2,
		transformer: numericTransformer,
	})
	carbsGPerServing: number;

	@Column({
		name: 'fat_g_per_serving',
		type: 'numeric',
		precision: 7,
		scale: 2,
		transformer: numericTransformer,
	})
	fatGPerServing: number;

	@Column({
		name: 'fiber_g_per_serving',
		type: 'numeric',
		precision: 7,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	fiberGPerServing: number | null;

	@Column({ type: 'smallint' })
	position: number;
}
