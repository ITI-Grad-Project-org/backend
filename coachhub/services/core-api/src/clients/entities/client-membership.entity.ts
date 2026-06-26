import {
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
	UpdateDateColumn,
}                     from 'typeorm';
import { Tenant }     from '../../tenant/entities/tenant.entity';
import { Client }     from './client.entity';
import { UserStatus } from '../../auth';

/**
 * Join entity linking a {@link Client} to a {@link Tenant}.
 *
 * A client can hold many memberships (one per tenant they were invited into),
 * which is what enables a client to belong to multiple tenants and switch
 * between them. All per-tenant state (status, block reason, invitation
 * metadata) lives here rather than on the global client identity.
 */
@Entity()
@Unique( [ 'client', 'tenant' ] )
export class ClientMembership {
	@PrimaryGeneratedColumn()
	id: number;

	@ManyToOne( () => Client, ( client ) => client.memberships,
		{ onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'client_id' } )
	client: Client;

	@ManyToOne( () => Tenant, { onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'tenant_id' } )
	tenant: Tenant;

	@Column( { type: 'enum', enum: UserStatus, default: UserStatus.PENDING } )
	status: UserStatus;

	@Column( { nullable: true } )
	blockReason: string;

	@CreateDateColumn()
	invitedAt: Date;

	@Column( { type: 'timestamp', nullable: true } )
	joinedAt: Date | null;

	@Column( { type: 'timestamp', nullable: true } )
	lastActiveAt: Date | null;

	@UpdateDateColumn()
	updated_at: Date;

	@DeleteDateColumn()
	deleted_at: Date;
}
