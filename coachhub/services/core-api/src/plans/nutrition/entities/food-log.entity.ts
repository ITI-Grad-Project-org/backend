import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { MealSlot, numericTransformer, ServingUnit } from '../../../common';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { Food } from './food.entity';
import { LoggedMeal } from './logged-meal.entity';
import { NutritionDayLog } from './nutrition-day-log.entity';

/** An immutable-at-finalization snapshot of actual client-reported intake. */
@Entity('food_logs')
@Index('ix_food_logs_membership_logged_at', ['membershipId', 'loggedAt'])
@Index('ix_food_logs_day_log', ['nutritionDayLogId'])
@Check('ck_food_logs_amount', `"amount" IS NULL OR "amount" > 0`)
@Check(
	'ck_food_logs_serving_size',
	`"serving_size" IS NULL OR "serving_size" > 0`,
)
@Check(
	'ck_food_logs_non_negative_nutrients',
	`("calories" IS NULL OR "calories" >= 0) AND ("protein_g" IS NULL OR "protein_g" >= 0) AND ("carbs_g" IS NULL OR "carbs_g" >= 0) AND ("fat_g" IS NULL OR "fat_g" >= 0) AND ("fiber_g" IS NULL OR "fiber_g" >= 0)`,
)
export class FoodLog {
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

	@Column({ name: 'nutrition_day_log_id', type: 'uuid' })
	nutritionDayLogId: string;

	@ManyToOne(() => NutritionDayLog, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'nutrition_day_log_id' })
	nutritionDayLog: NutritionDayLog;

	@Column({ name: 'logged_meal_id', type: 'uuid', nullable: true })
	loggedMealId: string | null;

	@ManyToOne(() => LoggedMeal, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'logged_meal_id' })
	loggedMeal: LoggedMeal | null;

	@Column({ name: 'food_id', type: 'uuid', nullable: true })
	foodId: string | null;

	@ManyToOne(() => Food, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'food_id' })
	food: Food | null;

	@Column({
		name: 'meal_slot',
		type: 'enum',
		enum: MealSlot,
		enumName: 'meal_slot',
	})
	mealSlot: MealSlot;

	@Column({ name: 'food_name', length: 200 })
	foodName: string;

	@Column({ length: 100, nullable: true })
	brand: string | null;

	@Column({
		name: 'serving_size',
		type: 'numeric',
		precision: 8,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	servingSize: number | null;

	@Column({
		name: 'serving_unit',
		type: 'enum',
		enum: ServingUnit,
		enumName: 'serving_unit',
		nullable: true,
	})
	servingUnit: ServingUnit | null;

	@Column({
		type: 'numeric',
		precision: 8,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	amount: number | null;

	@Column({
		type: 'numeric',
		precision: 9,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	calories: number | null;

	@Column({
		name: 'protein_g',
		type: 'numeric',
		precision: 8,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	proteinG: number | null;

	@Column({
		name: 'carbs_g',
		type: 'numeric',
		precision: 8,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	carbsG: number | null;

	@Column({
		name: 'fat_g',
		type: 'numeric',
		precision: 8,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	fatG: number | null;

	@Column({
		name: 'fiber_g',
		type: 'numeric',
		precision: 8,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	fiberG: number | null;

	@Column({ name: 'client_notes', type: 'text', nullable: true })
	clientNotes: string | null;

	@Column({ name: 'logged_at', type: 'timestamptz', default: () => 'now()' })
	loggedAt: Date;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
