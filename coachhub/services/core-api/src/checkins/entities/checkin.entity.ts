import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { ClientMembership } from '../../clients/entities/client-membership.entity';
import { Coach } from '../../coaches/entities/coach.entity';
import { CheckinStatus } from '../../common';
import { Tenant } from '../../tenant/entities/tenant.entity';

/**
 * A periodic client submission the coach reads and responds to.
 *
 * Distinct from `activity_logs`, which records that a client logged *something*
 * on a given day and drives the streak graph. A check-in is the conversation
 * around that activity: how the week felt, what got in the way, and the coach's
 * reply. It is the only place a coach-facing review queue and a response-time
 * metric can come from.
 */
@Entity('checkins')
@Index('uq_checkins_membership_date', ['membershipId', 'scheduledFor'], {
	unique: true,
})
@Index('ix_checkins_tenant_status', ['tenantId', 'status'])
@Check(
	'ck_checkins_submission_state',
	`("status" IN ('pending', 'missed') AND "submitted_at" IS NULL AND "reviewed_at" IS NULL) OR ("status" = 'submitted' AND "submitted_at" IS NOT NULL AND "reviewed_at" IS NULL) OR ("status" = 'reviewed' AND "submitted_at" IS NOT NULL AND "reviewed_at" IS NOT NULL)`,
)
// Deliberately NOT constraining reviewed_at and reviewed_by to be set together:
// reviewed_by is ON DELETE SET NULL, so removing a coach would nullify it while
// reviewed_at stayed set and the constraint would block the delete. The review
// timestamp is the fact worth keeping; the reviewer is attribution that may age out.
export class Checkin {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'membership_id', type: 'uuid' })
	membershipId: string;

	@ManyToOne(() => ClientMembership, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'membership_id' })
	membership: ClientMembership;

	/** The period this check-in covers — the cadence anchor, not a deadline. */
	@Column({ name: 'scheduled_for', type: 'date' })
	scheduledFor: string;

	@Column({
		type: 'enum',
		enum: CheckinStatus,
		enumName: 'checkin_status',
		default: CheckinStatus.PENDING,
	})
	status: CheckinStatus;

	@Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
	submittedAt: Date | null;

	@Column({ name: 'client_notes', type: 'text', nullable: true })
	clientNotes: string | null;

	/**
	 * Free-form key/number pairs, matching the `checkin.submitted` payload in
	 * contracts/events.json. Deliberately unstructured: what a coach asks for
	 * varies per practice, and hard columns here would force a migration per
	 * question. Body metrics that need trending belong in `measurements`.
	 */
	@Column({ type: 'jsonb', nullable: true })
	metrics: Record<string, number> | null;

	@Column({ type: 'jsonb', default: () => "'[]'" })
	photos: string[];

	@Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
	reviewedAt: Date | null;

	@Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
	reviewedBy: string | null;

	@ManyToOne(() => Coach, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'reviewed_by' })
	reviewer: Coach | null;

	@Column({ name: 'coach_feedback', type: 'text', nullable: true })
	coachFeedback: string | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
