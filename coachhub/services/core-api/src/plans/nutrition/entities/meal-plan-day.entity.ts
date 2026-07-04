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
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { MealPlanWeek } from './meal-plan-week.entity';
import { PlanMeal } from './plan-meal.entity';

@Entity('meal_plan_days')
@Unique(['mealPlanWeek', 'dayNumber'])
@Check(`"day_number" BETWEEN 1 AND 7`)
@Index('ix_mp_days_week', ['mealPlanWeekId'])
export class MealPlanDay {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'meal_plan_week_id', type: 'uuid' })
	mealPlanWeekId: string;

	@ManyToOne(() => MealPlanWeek, (week) => week.days, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'meal_plan_week_id' })
	mealPlanWeek: MealPlanWeek;

	/** 1 = Monday .. 7 = Sunday. */
	@Column({ name: 'day_number', type: 'smallint' })
	dayNumber: number;

	@Column({ type: 'text', nullable: true })
	notes: string | null;

	@OneToMany(() => PlanMeal, (meal) => meal.mealPlanDay)
	meals: PlanMeal[];
}
