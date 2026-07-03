import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
}                           from 'typeorm';
import { Tenant }           from '../../../tenant/entities/tenant.entity';
import { MealPlan }         from './meal-plan.entity';
import {
	ClientMembership
}                           from '../../../clients/entities/client-membership.entity';
import { AssignmentStatus } from '../../../common';

@Entity( 'meal_plan_assignments' )
export class MealPlanAssignment {
	@PrimaryGeneratedColumn( 'uuid' )
	id: string;

	@Column( { name: 'tenant_id', type: 'uuid' } )
	tenantId: string;

	@ManyToOne( () => Tenant, { nullable: false, onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'tenant_id' } )
	tenant: Tenant;

	@Column( { name: 'meal_plan_id', type: 'uuid' } )
	mealPlanId: string;

	@ManyToOne( () => MealPlan, { nullable: false } )
	@JoinColumn( { name: 'meal_plan_id' } )
	mealPlan: MealPlan;

	@Column( { name: 'membership_id', type: 'uuid' } )
	membershipId: string;

	@ManyToOne( () => ClientMembership, { nullable: false, onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'membership_id' } )
	membership: ClientMembership;

	@Column( { name: 'start_date', type: 'date' } )
	startDate: string;

	@Column( { name: 'end_date', type: 'date', nullable: true } )
	endDate: string | null;

	@Column( {
		type: 'enum',
		enum: AssignmentStatus,
		enumName: 'assignment_status',
		default: AssignmentStatus.SCHEDULED,
	} )
	status: AssignmentStatus;

	@CreateDateColumn( { name: 'created_at', type: 'timestamptz' } )
	createdAt: Date;
}
