import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { ProgramAssignment } from './program-assignment.entity';
import { ProgramWorkout } from './program-workout.entity';
import { SessionExercise } from './session-exercise.entity';
import { SessionStatus } from '../../../common';

/** A workout the client actually performed (design §4.5). */
@Entity('workout_sessions')
@Index('ix_sessions_membership_date', ['membershipId', 'performedAt'])
export class WorkoutSession {
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

	@ManyToOne(() => ProgramAssignment, { nullable: true })
	@JoinColumn({ name: 'assignment_id' })
	assignment: ProgramAssignment | null;

	/** NULL = ad-hoc session not tied to a planned workout day. */
	@ManyToOne(() => ProgramWorkout, { nullable: true })
	@JoinColumn({ name: 'program_workout_id' })
	programWorkout: ProgramWorkout | null;

	@Column({ name: 'performed_at', type: 'timestamptz', default: () => 'now()' })
	performedAt: Date;

	@Column({ name: 'duration_minutes', type: 'smallint', nullable: true })
	durationMinutes: number | null;

	@Column({
		type: 'enum',
		enum: SessionStatus,
		enumName: 'session_status',
		default: SessionStatus.COMPLETED,
	})
	status: SessionStatus;

	@Column({ name: 'client_notes', type: 'text', nullable: true })
	clientNotes: string | null;

	@OneToMany(() => SessionExercise, (exercise) => exercise.session, {
		cascade: ['insert'],
	})
	exercises: SessionExercise[];

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;
}
