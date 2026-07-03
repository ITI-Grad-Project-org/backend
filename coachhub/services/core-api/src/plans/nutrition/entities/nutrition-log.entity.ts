import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
}                 from 'typeorm';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import {
	ClientMembership
}                 from '../../../clients/entities/client-membership.entity';
import { Food }   from './food.entity';
import {
	MealSlot,
	numericTransformer,
}                 from '../../../common';

/** Client food diary; macros are snapshotted at log time (design §5.4). */
@Entity( 'nutrition_logs' )
@Index( 'ix_nutrition_logs_day', [ 'membershipId', 'loggedAt' ] )
export class NutritionLog {
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

	@Column( { name: 'logged_at', type: 'timestamptz', default: () => 'now()' } )
	loggedAt: Date;

	@Column( {
		name: 'meal_type',
		type: 'enum',
		enum: MealSlot,
		enumName: 'meal_slot',
	} )
	mealType: MealSlot;

	@ManyToOne( () => Food, { nullable: true } )
	@JoinColumn( { name: 'food_id' } )
	food: Food | null;

	/** Free-text entry when the food isn't in the library. */
	@Column( { name: 'free_text', length: 200, nullable: true } )
	freeText: string | null;

	@Column( {
		type: 'numeric',
		precision: 7,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	} )
	quantity: number | null;

	// Macro snapshot at log time.
	@Column( {
		type: 'numeric',
		precision: 7,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	} )
	calories: number | null;

	@Column( {
		name: 'protein_g',
		type: 'numeric',
		precision: 6,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	} )
	proteinG: number | null;

	@Column( {
		name: 'carbs_g',
		type: 'numeric',
		precision: 6,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	} )
	carbsG: number | null;

	@Column( {
		name: 'fat_g',
		type: 'numeric',
		precision: 6,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	} )
	fatG: number | null;
}
