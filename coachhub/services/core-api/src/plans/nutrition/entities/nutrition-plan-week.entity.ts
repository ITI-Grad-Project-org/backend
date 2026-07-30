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
import { NutritionPlanDay } from './nutrition-plan-day.entity';
import { NutritionPlan } from './nutrition-plan.entity';

@Entity('nutrition_plan_weeks')
@Unique(['nutritionPlanId', 'weekNumber'])
@Check('ck_nutrition_plan_weeks_number', `"week_number" >= 1`)
export class NutritionPlanWeek {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'nutrition_plan_id', type: 'uuid' })
	nutritionPlanId: string;

	@ManyToOne(() => NutritionPlan, (plan) => plan.weeks, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'nutrition_plan_id' })
	nutritionPlan: NutritionPlan;

	@Column({ name: 'week_number', type: 'smallint' })
	weekNumber: number;

	@Column({ type: 'text', nullable: true })
	notes: string | null;

	@OneToMany(() => NutritionPlanDay, (day) => day.nutritionPlanWeek, {
		cascade: ['insert'],
	})
	days: NutritionPlanDay[];
}
