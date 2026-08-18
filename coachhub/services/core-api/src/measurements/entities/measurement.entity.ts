import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { ClientMembership } from '../../clients/entities/client-membership.entity';
import { Coach } from '../../coaches/entities/coach.entity';
import { numericTransformer } from '../../common';

@Entity('measurements')
@Unique(['membership', 'measuredAt'])
@Index('ix_measurements_tenant_review', [
	'tenantId',
	'reviewedAt',
	'measuredAt',
])
export class Measurement {
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

	@Column({
		name: 'measured_at',
		type: 'date',
		default: () => 'CURRENT_DATE',
	})
	measuredAt: string;

	@Column({
		name: 'weight_kg',
		type: 'numeric',
		precision: 5,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	weightKg: number | null;

	@Column({
		name: 'body_fat_pct',
		type: 'numeric',
		precision: 4,
		scale: 1,
		nullable: true,
		transformer: numericTransformer,
	})
	bodyFatPct: number | null;

	@Column({
		name: 'chest_cm',
		type: 'numeric',
		precision: 5,
		scale: 1,
		nullable: true,
		transformer: numericTransformer,
	})
	chestCm: number | null;

	@Column({
		name: 'waist_cm',
		type: 'numeric',
		precision: 5,
		scale: 1,
		nullable: true,
		transformer: numericTransformer,
	})
	waistCm: number | null;

	@Column({
		name: 'hips_cm',
		type: 'numeric',
		precision: 5,
		scale: 1,
		nullable: true,
		transformer: numericTransformer,
	})
	hipsCm: number | null;

	@Column({
		name: 'arm_cm',
		type: 'numeric',
		precision: 5,
		scale: 1,
		nullable: true,
		transformer: numericTransformer,
	})
	armCm: number | null;

	@Column({
		name: 'thigh_cm',
		type: 'numeric',
		precision: 5,
		scale: 1,
		nullable: true,
		transformer: numericTransformer,
	})
	thighCm: number | null;

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
}
