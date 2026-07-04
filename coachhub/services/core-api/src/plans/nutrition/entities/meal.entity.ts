import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	Unique,
	UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { Coach } from '../../../coaches/entities/coach.entity';
import { Food } from './food.entity';
import { numericTransformer } from '../../../common';

/**
 * The draggable meal cards
 */
@Entity('meal_library')
@Unique(['tenant', 'name'])
export class Meal {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@ManyToOne(() => Coach, { nullable: false })
	@JoinColumn({ name: 'created_by' })
	createdBy: Coach;

	/** e.g. "Chicken & Rice Bowl". */
	@Column({ length: 150 })
	name: string;

	@Column({ type: 'text', nullable: true })
	description: string | null;

	@Column({ name: 'photo_url', type: 'text', nullable: true })
	photoUrl: string | null;

	/** Cooking/prep instructions. */
	@Column({ name: 'prep_notes', type: 'text', nullable: true })
	prepNotes: string | null;

	@Column({ name: 'is_active', default: true })
	isActive: boolean;

	@OneToMany(() => MealLibraryItem, (item) => item.meal, {
		cascade: ['insert'],
	})
	items: MealLibraryItem[];

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}

@Entity('meal_library_items')
export class MealLibraryItem {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'meal_id', type: 'uuid' })
	mealId: string;

	@ManyToOne(() => Meal, (meal) => meal.items, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'meal_id' })
	meal: Meal;

	@Column({ name: 'food_id', type: 'uuid' })
	foodId: string;

	@ManyToOne(() => Food, { nullable: false })
	@JoinColumn({ name: 'food_id' })
	food: Food;

	/** Default composition (× the food's serving). */
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
