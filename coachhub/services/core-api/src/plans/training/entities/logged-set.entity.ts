import {
	Check,
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import {
	IntensityType,
	numericTransformer,
	SetOutcome,
	SetType,
} from '../../../common';
import { LoggedExercise } from './logged-exercise.entity';
import { PlannedSet } from './planned-set.entity';

@Entity('logged_sets')
@Unique(['loggedExerciseId', 'setNumber'])
@Unique(['loggedExerciseId', 'plannedSetId'])
@Index('ix_logged_sets_exercise', ['loggedExerciseId'])
@Check(
	'ck_logged_sets_planned_linkage',
	`("is_extra" AND "planned_set_id" IS NULL) OR (NOT "is_extra" AND "planned_set_id" IS NOT NULL)`,
)
@Check(
	'ck_logged_sets_prescription_shape',
	`"is_extra" OR "prescribed_set_type" IS NOT NULL`,
)
export class LoggedSet {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'logged_exercise_id', type: 'uuid' })
	loggedExerciseId: string;

	@ManyToOne(() => LoggedExercise, (exercise) => exercise.sets, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'logged_exercise_id' })
	loggedExercise: LoggedExercise;

	@Column({ name: 'planned_set_id', type: 'uuid', nullable: true })
	plannedSetId: string | null;

	@ManyToOne(() => PlannedSet, { nullable: true, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'planned_set_id' })
	plannedSet: PlannedSet | null;

	@Column({ name: 'set_number', type: 'smallint' })
	setNumber: number;

	@Column({ name: 'is_extra', default: false })
	isExtra: boolean;

	@Column({
		name: 'prescribed_set_type',
		type: 'enum',
		enum: SetType,
		enumName: 'set_type',
		nullable: true,
	})
	prescribedSetType: SetType | null;

	@Column({ name: 'prescribed_reps_min', type: 'smallint', nullable: true })
	prescribedRepsMin: number | null;

	@Column({ name: 'prescribed_reps_max', type: 'smallint', nullable: true })
	prescribedRepsMax: number | null;

	@Column({
		name: 'prescribed_duration_seconds',
		type: 'int',
		nullable: true,
	})
	prescribedDurationSeconds: number | null;

	@Column({
		name: 'prescribed_weight_kg',
		type: 'numeric',
		precision: 6,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	prescribedWeightKg: number | null;

	@Column({
		name: 'prescribed_intensity_type',
		type: 'enum',
		enum: IntensityType,
		enumName: 'intensity_type',
		nullable: true,
	})
	prescribedIntensityType: IntensityType | null;

	@Column({
		name: 'prescribed_intensity_value',
		type: 'numeric',
		precision: 5,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	prescribedIntensityValue: number | null;

	@Column({ type: 'smallint', nullable: true })
	reps: number | null;

	@Column({
		name: 'weight_kg',
		type: 'numeric',
		precision: 6,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	weightKg: number | null;

	@Column({ name: 'duration_seconds', type: 'int', nullable: true })
	durationSeconds: number | null;

	@Column({
		type: 'numeric',
		precision: 3,
		scale: 1,
		nullable: true,
		transformer: numericTransformer,
	})
	rpe: number | null;

	@Column({
		type: 'enum',
		enum: SetOutcome,
		enumName: 'set_outcome',
		default: SetOutcome.PENDING,
	})
	outcome: SetOutcome;
}
