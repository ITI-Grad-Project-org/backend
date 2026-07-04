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
import { WorkoutExercise } from './workout-exercise.entity';
import { IntensityType, numericTransformer, SetType } from '../../../common';

@Entity('workout_exercise_sets')
@Unique(['workoutExercise', 'setNumber'])
@Check(`"set_number" >= 1`)
@Check(
	`"reps_min" IS NOT NULL OR "duration_seconds" IS NOT NULL OR "set_type" IN ('amrap', 'to_failure', 'drop_set')`,
)
@Check(`("intensity_type" IS NULL) = ("intensity_value" IS NULL)`)
@Index('ix_wes_exercise', ['workoutExerciseId'])
export class WorkoutExerciseSet {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'workout_exercise_id', type: 'uuid' })
	workoutExerciseId: string;

	@ManyToOne(() => WorkoutExercise, (exercise) => exercise.sets, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'workout_exercise_id' })
	workoutExercise: WorkoutExercise;

	@Column({ name: 'set_number', type: 'smallint' })
	setNumber: number;

	@Column({
		name: 'set_type',
		type: 'enum',
		enum: SetType,
		enumName: 'set_type',
		default: SetType.WORKING,
	})
	setType: SetType;

	@Column({ name: 'reps_min', type: 'smallint', nullable: true })
	repsMin: number | null;

	@Column({ name: 'reps_max', type: 'smallint', nullable: true })
	repsMax: number | null;

	@Column({ name: 'duration_seconds', type: 'int', nullable: true })
	durationSeconds: number | null;

	@Column({
		name: 'weight_kg',
		type: 'numeric',
		precision: 6,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	weightKg: number | null;

	@Column({
		name: 'intensity_type',
		type: 'enum',
		enum: IntensityType,
		enumName: 'intensity_type',
		nullable: true,
	})
	intensityType: IntensityType | null;

	@Column({
		name: 'intensity_value',
		type: 'numeric',
		precision: 5,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	intensityValue: number | null;
}
