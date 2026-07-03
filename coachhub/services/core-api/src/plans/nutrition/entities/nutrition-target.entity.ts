import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
}                 from 'typeorm';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import {
	ClientMembership
}                 from '../../../clients/entities/client-membership.entity';

/** Daily macro targets, effective-dated per membership (design §5.4). */
@Entity( 'nutrition_targets' )
@Unique( [ 'membership', 'effectiveFrom' ] )
export class NutritionTarget {
	@PrimaryGeneratedColumn( 'uuid' )
	id: string;

	@Column( { name: 'tenant_id', type: 'uuid' } )
	tenantId: string;

	@ManyToOne( () => Tenant, { nullable: false, onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'tenant_id' } )
	tenant: Tenant;

	@Column( { name: 'membership_id', type: 'uuid' } )
	membershipId: string;

	@ManyToOne( () => ClientMembership, { nullable: false, onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'membership_id' } )
	membership: ClientMembership;

	@Column( { type: 'int' } )
	calories: number;

	@Column( { name: 'protein_g', type: 'int' } )
	proteinG: number;

	@Column( { name: 'carbs_g', type: 'int' } )
	carbsG: number;

	@Column( { name: 'fat_g', type: 'int' } )
	fatG: number;

	@Column( { name: 'water_ml', type: 'int', nullable: true } )
	waterMl: number | null;

	@Column( {
		name: 'effective_from',
		type: 'date',
		default: () => 'CURRENT_DATE',
	} )
	effectiveFrom: string;

	@CreateDateColumn( { name: 'created_at', type: 'timestamptz' } )
	createdAt: Date;
}
