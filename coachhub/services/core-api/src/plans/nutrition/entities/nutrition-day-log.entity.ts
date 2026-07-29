import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { NutritionAdherenceOutcome, NutritionLogStatus } from '../../../common';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { FoodLog } from './food-log.entity';
import { LoggedMeal } from './logged-meal.entity';
import { NutritionPlanDay } from './nutrition-plan-day.entity';
import { NutritionPlan } from './nutrition-plan.entity';

@Entity('nutrition_day_logs')
@Index('uq_nutrition_day_logs_plan_day', ['nutritionPlanDayId'], {
	unique: true,
})
@Index('ix_nutrition_day_logs_membership_date', [
	'membershipId',
	'scheduledDate',
])
@Check(
	'ck_nutrition_day_logs_completion_state',
	`("status" = 'in_progress' AND "completed_at" IS NULL) OR ("status" = 'finalized' AND "completed_at" IS NOT NULL)`,
)
@Check(
	'ck_nutrition_day_logs_water',
	`"water_ml_consumed" IS NULL OR "water_ml_consumed" >= 0`,
)
@Check(
	'ck_nutrition_day_logs_adherence_outcome',
	`"adherence_outcome" IS NULL OR "adherence_outcome" <> 'pending'`,
)
export class NutritionDayLog {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'membership_id', type: 'uuid' })
	membershipId: string;

	@ManyToOne(() => ClientMembership, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'membership_id' })
	membership: ClientMembership;

	@Column({ name: 'nutrition_plan_id', type: 'uuid' })
	nutritionPlanId: string;

	@ManyToOne(() => NutritionPlan, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'nutrition_plan_id' })
	nutritionPlan: NutritionPlan;

	@Column({ name: 'nutrition_plan_day_id', type: 'uuid' })
	nutritionPlanDayId: string;

	@ManyToOne(() => NutritionPlanDay, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'nutrition_plan_day_id' })
	nutritionPlanDay: NutritionPlanDay;

	@Column({ name: 'scheduled_date', type: 'date' })
	scheduledDate: string;

	@Column({
		type: 'enum',
		enum: NutritionLogStatus,
		enumName: 'nutrition_log_status',
		default: NutritionLogStatus.IN_PROGRESS,
	})
	status: NutritionLogStatus;

	@Column({
		name: 'adherence_outcome',
		type: 'enum',
		enum: NutritionAdherenceOutcome,
		enumName: 'nutrition_adherence_outcome',
		nullable: true,
	})
	adherenceOutcome: NutritionAdherenceOutcome | null;

	@Column({ name: 'water_ml_consumed', type: 'int', nullable: true })
	waterMlConsumed: number | null;

	@Column({ name: 'client_notes', type: 'text', nullable: true })
	clientNotes: string | null;

	@Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
	startedAt: Date;

	@Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
	completedAt: Date | null;

	@OneToMany(() => LoggedMeal, (meal) => meal.nutritionDayLog, {
		cascade: ['insert'],
	})
	meals: LoggedMeal[];

	@OneToMany(() => FoodLog, (foodLog) => foodLog.nutritionDayLog)
	foodLogs: FoodLog[];

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
