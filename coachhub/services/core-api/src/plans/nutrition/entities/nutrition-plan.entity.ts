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
import { Coach } from '../../../coaches/entities/coach.entity';
import {
	FitnessGoal,
	NutritionPlanStatus,
	NutritionPlanType,
} from '../../../common';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { NutritionPlanWeek } from './nutrition-plan-week.entity';

@Entity('nutrition_plans')
@Index('ix_nutrition_plans_tenant', ['tenantId'])
@Index('ix_nutrition_plans_tenant_membership', ['tenantId', 'membershipId'])
@Index('ix_nutrition_plans_tenant_status', ['tenantId', 'status'])
@Check(
	'ck_nutrition_plans_client_template_shape',
	`("plan_type" = 'client' AND "membership_id" IS NOT NULL AND "start_date" IS NOT NULL AND "end_date" IS NOT NULL) OR ("plan_type" = 'template' AND "membership_id" IS NULL AND "start_date" IS NULL AND "end_date" IS NULL)`,
)
@Check('ck_nutrition_plans_duration_weeks', `"duration_weeks" BETWEEN 1 AND 52`)
@Check(
	'ck_nutrition_plans_inclusive_dates',
	`"plan_type" <> 'client' OR "end_date" = "start_date" + ("duration_weeks" * 7 - 1)`,
)
@Check(
	'ck_nutrition_plans_source_template_not_self',
	`"source_template_id" IS NULL OR "source_template_id" <> "id"`,
)
@Check(
	'ck_nutrition_plans_targets',
	`("target_calories" IS NULL OR "target_calories" > 0) AND ("target_protein_g" IS NULL OR "target_protein_g" >= 0) AND ("target_carbs_g" IS NULL OR "target_carbs_g" >= 0) AND ("target_fat_g" IS NULL OR "target_fat_g" >= 0) AND ("target_fiber_g" IS NULL OR "target_fiber_g" >= 0) AND ("target_water_ml" IS NULL OR "target_water_ml" >= 0)`,
)
export class NutritionPlan {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@ManyToOne(() => Coach, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'created_by' })
	createdBy: Coach;

	@Column({
		name: 'plan_type',
		type: 'enum',
		enum: NutritionPlanType,
		enumName: 'nutrition_plan_type',
		default: NutritionPlanType.CLIENT,
	})
	planType: NutritionPlanType;

	@Column({ name: 'membership_id', type: 'uuid', nullable: true })
	membershipId: string | null;

	@ManyToOne(() => ClientMembership, { nullable: true, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'membership_id' })
	membership: ClientMembership | null;

	@Column({ name: 'source_template_id', type: 'uuid', nullable: true })
	sourceTemplateId: string | null;

	@ManyToOne(() => NutritionPlan, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'source_template_id' })
	sourceTemplate: NutritionPlan | null;

	@Column({ length: 150 })
	name: string;

	@Column({ type: 'text', nullable: true })
	description: string | null;

	@Column({
		type: 'enum',
		enum: FitnessGoal,
		enumName: 'fitness_goal',
		nullable: true,
	})
	goal: FitnessGoal | null;

	@Column({ name: 'duration_weeks', type: 'smallint' })
	durationWeeks: number;

	@Column({ name: 'start_date', type: 'date', nullable: true })
	startDate: string | null;

	@Column({ name: 'end_date', type: 'date', nullable: true })
	endDate: string | null;

	@Column({ name: 'target_calories', type: 'int', nullable: true })
	targetCalories: number | null;

	@Column({ name: 'target_protein_g', type: 'int', nullable: true })
	targetProteinG: number | null;

	@Column({ name: 'target_carbs_g', type: 'int', nullable: true })
	targetCarbsG: number | null;

	@Column({ name: 'target_fat_g', type: 'int', nullable: true })
	targetFatG: number | null;

	@Column({ name: 'target_fiber_g', type: 'int', nullable: true })
	targetFiberG: number | null;

	@Column({ name: 'target_water_ml', type: 'int', nullable: true })
	targetWaterMl: number | null;

	@Column({
		type: 'enum',
		enum: NutritionPlanStatus,
		enumName: 'nutrition_plan_status',
		default: NutritionPlanStatus.DRAFT,
	})
	status: NutritionPlanStatus;

	@Column({ name: 'is_archived', default: false })
	isArchived: boolean;

	@OneToMany(() => NutritionPlanWeek, (week) => week.nutritionPlan, {
		cascade: ['insert'],
	})
	weeks: NutritionPlanWeek[];

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
