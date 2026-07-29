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
import {
	MealSlot,
	NutritionAdherenceOutcome,
	numericTransformer,
} from '../../../common';
import { Meal } from './meal.entity';
import { NutritionDayLog } from './nutrition-day-log.entity';
import { PlannedMeal } from './planned-meal.entity';

@Entity('logged_meals')
@Unique(['nutritionDayLogId', 'plannedMealId'])
@Unique(['nutritionDayLogId', 'position'])
@Index('ix_logged_meals_day_log', ['nutritionDayLogId'])
@Check('ck_logged_meals_position', `"position" >= 1`)
@Check(
	'ck_logged_meals_non_negative_nutrients',
	`"prescribed_calories" >= 0 AND "prescribed_protein_g" >= 0 AND "prescribed_carbs_g" >= 0 AND "prescribed_fat_g" >= 0 AND ("prescribed_fiber_g" IS NULL OR "prescribed_fiber_g" >= 0)`,
)
export class LoggedMeal {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'nutrition_day_log_id', type: 'uuid' })
	nutritionDayLogId: string;

	@ManyToOne(() => NutritionDayLog, (log) => log.meals, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'nutrition_day_log_id' })
	nutritionDayLog: NutritionDayLog;

	@Column({ name: 'planned_meal_id', type: 'uuid' })
	plannedMealId: string;

	@ManyToOne(() => PlannedMeal, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'planned_meal_id' })
	plannedMeal: PlannedMeal;

	@Column({ name: 'source_meal_id', type: 'uuid' })
	sourceMealId: string;

	@ManyToOne(() => Meal, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'source_meal_id' })
	sourceMeal: Meal;

	@Column({ name: 'meal_name', length: 150 })
	mealName: string;

	@Column({
		type: 'enum',
		enum: MealSlot,
		enumName: 'meal_slot',
	})
	slot: MealSlot;

	@Column({ type: 'smallint' })
	position: number;

	@Column({
		name: 'prescribed_calories',
		type: 'numeric',
		precision: 9,
		scale: 2,
		transformer: numericTransformer,
	})
	prescribedCalories: number;

	@Column({
		name: 'prescribed_protein_g',
		type: 'numeric',
		precision: 8,
		scale: 2,
		transformer: numericTransformer,
	})
	prescribedProteinG: number;

	@Column({
		name: 'prescribed_carbs_g',
		type: 'numeric',
		precision: 8,
		scale: 2,
		transformer: numericTransformer,
	})
	prescribedCarbsG: number;

	@Column({
		name: 'prescribed_fat_g',
		type: 'numeric',
		precision: 8,
		scale: 2,
		transformer: numericTransformer,
	})
	prescribedFatG: number;

	@Column({
		name: 'prescribed_fiber_g',
		type: 'numeric',
		precision: 8,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	prescribedFiberG: number | null;

	@Column({
		type: 'enum',
		enum: NutritionAdherenceOutcome,
		enumName: 'nutrition_adherence_outcome',
		default: NutritionAdherenceOutcome.PENDING,
	})
	outcome: NutritionAdherenceOutcome;

	@Column({ name: 'client_notes', type: 'text', nullable: true })
	clientNotes: string | null;
}
