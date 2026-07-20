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
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Client } from './client.entity';
import { MembershipStatus } from '../../common';

@Entity('memberships')
@Unique(['tenant', 'client'])
export class ClientMembership {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@ManyToOne(() => Client, (client) => client.memberships, {
		nullable: true,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'client_id' })
	client: Client | null;

	@Column({
		type: 'enum',
		enum: MembershipStatus,
		enumName: 'membership_status',
		default: MembershipStatus.INVITED,
	})
	status: MembershipStatus;

	@Column({ type: 'text', nullable: true })
	blockReason: string | null;

	/** The client's note to the coach, set only on client-initiated requests. */
	@Column({ name: 'request_message', type: 'text', nullable: true })
	requestMessage: string | null;

	/** When the coach approved or rejected a request. */
	@Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
	decidedAt: Date | null;

	@Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
	joinedAt: Date | null;

	@Column({ name: 'last_active_at', type: 'timestamptz', nullable: true })
	lastActiveAt: Date | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;

	@DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
	deletedAt: Date | null;
}
