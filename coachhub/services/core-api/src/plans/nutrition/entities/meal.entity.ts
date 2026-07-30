import {
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
import { DietaryPreference } from '../../../common';
import { Coach } from '../../../coaches/entities/coach.entity';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { MealIngredient } from './meal-ingredient.entity';

@Entity('meals')
@Index('ux_meals_tenant_name', ['tenantId', 'name'], { unique: true })
@Index('ix_meals_tenant_active', ['tenantId', 'isActive'])
export class Meal {
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

	@Column({ length: 150 })
	name: string;

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

	@Column({ name: 'is_active', default: true })
	isActive: boolean;

	@OneToMany(() => MealIngredient, (ingredient) => ingredient.meal, {
		cascade: ['insert'],
	})
	ingredients: MealIngredient[];

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
