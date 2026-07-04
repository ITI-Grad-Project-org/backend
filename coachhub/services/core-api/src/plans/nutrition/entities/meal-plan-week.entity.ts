import {
	Check,
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { MealPlan } from './meal-plan.entity';
import { MealPlanDay } from './meal-plan-day.entity';

@Entity('meal_plan_weeks')
@Unique(['mealPlan', 'weekNumber'])
@Check(`"week_number" >= 1`)
export class MealPlanWeek {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'meal_plan_id', type: 'uuid' })
	mealPlanId: string;

	@ManyToOne(() => MealPlan, (plan) => plan.weeks, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'meal_plan_id' })
	mealPlan: MealPlan;

	@Column({ name: 'week_number', type: 'smallint' })
	weekNumber: number;

	@Column({ type: 'text', nullable: true })
	notes: string | null;

	@OneToMany(() => MealPlanDay, (day) => day.mealPlanWeek, {
		cascade: ['insert'],
	})
	days: MealPlanDay[];
}
