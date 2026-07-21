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
import { NutritionPlanWeek } from './nutrition-plan-week.entity';
import { PlannedMeal } from './planned-meal.entity';

@Entity('nutrition_plan_days')
@Unique(['nutritionPlanWeekId', 'dayNumber'])
@Index('ix_nutrition_plan_days_week', ['nutritionPlanWeekId'])
@Check('ck_nutrition_plan_days_number', `"day_number" BETWEEN 1 AND 7`)
@Check(
	'ck_nutrition_plan_days_target_overrides',
	`("target_calories_override" IS NULL OR "target_calories_override" > 0) AND ("target_protein_g_override" IS NULL OR "target_protein_g_override" >= 0) AND ("target_carbs_g_override" IS NULL OR "target_carbs_g_override" >= 0) AND ("target_fat_g_override" IS NULL OR "target_fat_g_override" >= 0) AND ("target_fiber_g_override" IS NULL OR "target_fiber_g_override" >= 0) AND ("target_water_ml_override" IS NULL OR "target_water_ml_override" >= 0)`,
)
export class NutritionPlanDay {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'nutrition_plan_week_id', type: 'uuid' })
	nutritionPlanWeekId: string;

	@ManyToOne(() => NutritionPlanWeek, (week) => week.days, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'nutrition_plan_week_id' })
	nutritionPlanWeek: NutritionPlanWeek;

	/** Relative day within the rolling plan week: 1 through 7. */
	@Column({ name: 'day_number', type: 'smallint' })
	dayNumber: number;

	@Column({ name: 'is_flexible_day', default: false })
	isFlexibleDay: boolean;

	@Column({ name: 'target_calories_override', type: 'int', nullable: true })
	targetCaloriesOverride: number | null;

	@Column({ name: 'target_protein_g_override', type: 'int', nullable: true })
	targetProteinGOverride: number | null;

	@Column({ name: 'target_carbs_g_override', type: 'int', nullable: true })
	targetCarbsGOverride: number | null;

	@Column({ name: 'target_fat_g_override', type: 'int', nullable: true })
	targetFatGOverride: number | null;

	@Column({ name: 'target_fiber_g_override', type: 'int', nullable: true })
	targetFiberGOverride: number | null;

	@Column({ name: 'target_water_ml_override', type: 'int', nullable: true })
	targetWaterMlOverride: number | null;

	@Column({ type: 'text', nullable: true })
	notes: string | null;

	@OneToMany(() => PlannedMeal, (meal) => meal.nutritionPlanDay)
	meals: PlannedMeal[];
}
