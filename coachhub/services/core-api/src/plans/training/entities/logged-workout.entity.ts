import {
	Check,
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
import { numericTransformer, SessionStatus } from '../../../common';

@Entity('logged_workouts')
@Index('ix_logged_workouts_membership_date', ['membershipId', 'scheduledDate'])
@Index('uq_logged_workouts_program_day', ['programDayId'], { unique: true })
@Check(
	'ck_logged_workouts_completion_state',
	`("status" = 'in_progress' AND "completed_at" IS NULL) OR ("status" <> 'in_progress' AND "completed_at" IS NOT NULL)`,
)
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

	@Column({ name: 'program_day_id', type: 'uuid' })
	programDayId: string;

	@ManyToOne(() => ProgramDay, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'program_day_id' })
	programDay: ProgramDay;

	@Column({ name: 'scheduled_date', type: 'date' })
	scheduledDate: string;

	@Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
	startedAt: Date;

	@Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
	completedAt: Date | null;

	@Column({ name: 'duration_minutes', type: 'smallint', nullable: true })
	durationMinutes: number | null;

	@Column({
		type: 'enum',
		enum: SessionStatus,
		enumName: 'session_status',
		default: SessionStatus.IN_PROGRESS,
	})
	status: SessionStatus;

	@Column({ name: 'client_notes', type: 'text', nullable: true })
	clientNotes: string | null;

	@Column({
		name: 'overall_rpe',
		type: 'numeric',
		precision: 3,
		scale: 1,
		nullable: true,
		transformer: numericTransformer,
	})
	overallRpe: number | null;

	@OneToMany(() => LoggedExercise, (exercise) => exercise.loggedWorkout, {
		cascade: ['insert'],
	})
	exercises: LoggedExercise[];

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;
}
