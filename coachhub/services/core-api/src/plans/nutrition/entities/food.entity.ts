import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
}                                           from 'typeorm';
import {
	Tenant
}                                           from '../../../tenant/entities/tenant.entity';
import { numericTransformer, ServingUnit, } from '../../../common';

@Entity( 'foods' )
export class Food {
	@PrimaryGeneratedColumn( 'uuid' )
	id: string;

	@Column( { name: 'tenant_id', type: 'uuid', nullable: true } )
	tenantId: string | null;

	@ManyToOne( () => Tenant, { nullable: true, onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'tenant_id' } )
	tenant: Tenant | null;

	@Column( { length: 150 } )
	name: string;

	@Column( { length: 100, nullable: true } )
	brand: string | null;

	@Column( {
		name: 'serving_size',
		type: 'numeric',
		precision: 7,
		scale: 2,
		default: 100,
		transformer: numericTransformer,
	} )
	servingSize: number;

	@Column( {
		name: 'serving_unit',
		type: 'enum',
		enum: ServingUnit,
		enumName: 'serving_unit',
		default: ServingUnit.G,
	} )
	servingUnit: ServingUnit;

	@Column( {
		type: 'numeric',
		precision: 7,
		scale: 2,
		transformer: numericTransformer,
	} )
	calories: number;

	@Column( {
		name: 'protein_g',
		type: 'numeric',
		precision: 6,
		scale: 2,
		default: 0,
		transformer: numericTransformer,
	} )
	proteinG: number;

	@Column( {
		name: 'carbs_g',
		type: 'numeric',
		precision: 6,
		scale: 2,
		default: 0,
		transformer: numericTransformer,
	} )
	carbsG: number;

	@Column( {
		name: 'fat_g',
		type: 'numeric',
		precision: 6,
		scale: 2,
		default: 0,
		transformer: numericTransformer,
	} )
	fatG: number;

	@Column( {
		name: 'fiber_g',
		type: 'numeric',
		precision: 6,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	} )
	fiberG: number | null;

	@Column( { name: 'is_active', default: true } )
	isActive: boolean;

	@CreateDateColumn( { name: 'created_at', type: 'timestamptz' } )
	createdAt: Date;
}
