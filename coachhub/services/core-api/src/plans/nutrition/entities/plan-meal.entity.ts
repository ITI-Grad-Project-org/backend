import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { MealPlanDay } from './meal-plan-day.entity';
import { Meal } from './meal.entity';
import { Food } from './food.entity';
import { MealSlot, numericTransformer } from '../../../common';

@Entity('plan_meals')
@Unique(['mealPlanDay', 'slot', 'position'])
@Index('ix_plan_meals_day', ['mealPlanDayId', 'slot'])
export class PlanMeal {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'meal_plan_day_id', type: 'uuid' })
	mealPlanDayId: string;

	@ManyToOne(() => MealPlanDay, (day) => day.meals, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'meal_plan_day_id' })
	mealPlanDay: MealPlanDay;

	@Column({
		type: 'enum',
		enum: MealSlot,
		enumName: 'meal_slot',
	})
	slot: MealSlot;

	@Column({ type: 'smallint', default: 1 })
	position: number;

	@ManyToOne(() => Meal, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'source_meal_id' })
	sourceMeal: Meal | null;

	@Column({ length: 150 })
	name: string;

	@Column({
		type: 'numeric',
		precision: 4,
		scale: 2,
		default: 1,
		transformer: numericTransformer,
	})
	servings: number;

	@Column({ name: 'coach_notes', type: 'text', nullable: true })
	coachNotes: string | null;

	@OneToMany(() => PlanMealItem, (item) => item.planMeal, {
		cascade: ['insert'],
	})
	items: PlanMealItem[];
}

@Entity('plan_meal_items')
export class PlanMealItem {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'plan_meal_id', type: 'uuid' })
	planMealId: string;

	@ManyToOne(() => PlanMeal, (planMeal) => planMeal.items, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'plan_meal_id' })
	planMeal: PlanMeal;

	@Column({ name: 'food_id', type: 'uuid' })
	foodId: string;

	@ManyToOne(() => Food, { nullable: false })
	@JoinColumn({ name: 'food_id' })
	food: Food;

	@Column({
		type: 'numeric',
		precision: 7,
		scale: 2,
		transformer: numericTransformer,
	})
	quantity: number;

	@Column({ type: 'smallint' })
	position: number;
}
