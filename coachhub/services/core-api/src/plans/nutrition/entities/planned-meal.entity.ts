import {
	Check,
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { DietaryPreference, MealSlot } from '../../../common';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { Meal } from './meal.entity';
import { NutritionPlanDay } from './nutrition-plan-day.entity';
import { PlannedMealFood } from './planned-meal-food.entity';

@Entity('planned_meals')
@Unique(['nutritionPlanDayId', 'position'])
@Index('ix_planned_meals_day_slot', ['nutritionPlanDayId', 'slot'])
@Check('ck_planned_meals_position', `"position" >= 1`)
export class PlannedMeal {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'nutrition_plan_day_id', type: 'uuid' })
	nutritionPlanDayId: string;

	@ManyToOne(() => NutritionPlanDay, (day) => day.meals, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'nutrition_plan_day_id' })
	nutritionPlanDay: NutritionPlanDay;

	@Column({ name: 'source_meal_id', type: 'uuid' })
	sourceMealId: string;

	@ManyToOne(() => Meal, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'source_meal_id' })
	sourceMeal: Meal;

	@Column({ name: 'meal_name', length: 150 })
	mealName: string;

	@Column({ type: 'text', nullable: true })
	description: string | null;

	@Column({ name: 'photo_url', type: 'text', nullable: true })
	photoUrl: string | null;

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

	@Column({ type: 'text', array: true, default: '{}' })
	allergens: string[];

	@Column({
		type: 'enum',
		enum: MealSlot,
		enumName: 'meal_slot',
	})
	slot: MealSlot;

	@Column({ type: 'smallint' })
	position: number;

	@Column({ name: 'suggested_time', type: 'time', nullable: true })
	suggestedTime: string | null;

	@Column({ name: 'coach_notes', type: 'text', nullable: true })
	coachNotes: string | null;

	@OneToMany(() => PlannedMealFood, (food) => food.plannedMeal, {
		cascade: ['insert'],
	})
	foods: PlannedMealFood[];
}
