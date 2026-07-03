import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
}                   from 'typeorm';
import { Tenant }   from '../../../tenant/entities/tenant.entity';
import { Coach }    from '../../../coaches/entities/coach.entity';
import { PlanMeal } from './plan-meal.entity';

/** The weekly nutrition grid  */
@Entity( 'meal_plans' )
export class MealPlan {
	@PrimaryGeneratedColumn( 'uuid' )
	id: string;

	@Column( { name: 'tenant_id', type: 'uuid' } )
	tenantId: string;

	@ManyToOne( () => Tenant, { nullable: false, onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'tenant_id' } )
	tenant: Tenant;

	@ManyToOne( () => Coach, { nullable: false } )
	@JoinColumn( { name: 'created_by' } )
	createdBy: Coach;

	@Column( { length: 150 } )
	name: string;

	@Column( { type: 'text', nullable: true } )
	description: string | null;

	@Column( { name: 'target_calories', type: 'int', nullable: true } )
	targetCalories: number | null;

	@Column( { name: 'target_protein_g', type: 'int', nullable: true } )
	targetProteinG: number | null;

	@Column( { name: 'target_carbs_g', type: 'int', nullable: true } )
	targetCarbsG: number | null;

	@Column( { name: 'target_fat_g', type: 'int', nullable: true } )
	targetFatG: number | null;

	@Column( { name: 'is_template', default: true } )
	isTemplate: boolean;

	@Column( { name: 'is_archived', default: false } )
	isArchived: boolean;

	@OneToMany( () => PlanMeal, ( planMeal ) => planMeal.mealPlan )
	meals: PlanMeal[];

	@CreateDateColumn( { name: 'created_at', type: 'timestamptz' } )
	createdAt: Date;

	@UpdateDateColumn( { name: 'updated_at', type: 'timestamptz' } )
	updatedAt: Date;
}
