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
import { Program } from './program.entity';
import { ProgramDay } from './program-day.entity';
import { LoggedExercise } from './logged-exercise.entity';
import { SessionStatus } from '../../../common';

@Entity('logged_workouts')
@Index('ix_sessions_membership_date', ['membershipId', 'performedAt'])
export class LoggedWorkout {
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

	@Column({ name: 'program_id', type: 'uuid' })
	programId: string;

	@ManyToOne(() => Program, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'program_id' })
	program: Program;

	/** NULL = ad-hoc session not tied to a planned day. */
	@ManyToOne(() => ProgramDay, { nullable: true })
	@JoinColumn({ name: 'program_day_id' })
	programDay: ProgramDay | null;

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

	@OneToMany(() => LoggedExercise, (exercise) => exercise.loggedWorkout, {
		cascade: ['insert'],
	})
	exercises: LoggedExercise[];

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;
}
