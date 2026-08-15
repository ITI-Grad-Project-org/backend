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
import { MembershipStatus, numericTransformer } from '../../common';

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

	// Set when a coach approves a join request: the membership waits in `INVITED`
	// until the client types this 6-digit code (only its hash is stored, wrong
	// guesses are capped) — mirrors the coach-invite flow.
	@Column({
		name: 'invite_otp_hash',
		type: 'text',
		nullable: true,
		select: false,
	})
	inviteOtpHash: string | null;

	@Column({
		name: 'invite_otp_expires',
		type: 'timestamptz',
		nullable: true,
		select: false,
	})
	inviteOtpExpires: Date | null;

	@Column({
		name: 'invite_otp_attempts',
		type: 'int',
		default: 0,
		select: false,
	})
	inviteOtpAttempts: number;

	/**
	 * What this client pays the coach per month. Set by the coach — CoachHub
	 * does not process payments, so this is the agreed rate, not a charge.
	 * Null means "not commercially tracked" and is excluded from MRR rather
	 * than counted as zero.
	 */
	@Column({
		name: 'monthly_price',
		type: 'numeric',
		precision: 10,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	monthlyPrice: number | null;

	/** ISO 4217. MRR is reported per currency; there is no FX conversion. */
	@Column({ type: 'char', length: 3, default: 'USD' })
	currency: string;

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
