import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { LoggedWorkout } from './logged-workout.entity';
import { PlannedExercise } from './planned-exercise.entity';
import { Exercise } from '../../../exercises/entities/exercise.entity';
import { LoggedSet } from './logged-set.entity';

@Entity('logged_exercises')
@Unique(['loggedWorkoutId', 'plannedExerciseId'])
@Unique(['loggedWorkoutId', 'position'])
@Index('ix_logged_exercises_workout', ['loggedWorkoutId'])
export class LoggedExercise {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'logged_workout_id', type: 'uuid' })
	loggedWorkoutId: string;

	@ManyToOne(() => LoggedWorkout, (workout) => workout.exercises, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'logged_workout_id' })
	loggedWorkout: LoggedWorkout;

	@Column({ name: 'planned_exercise_id', type: 'uuid' })
	plannedExerciseId: string;

	/** Required V1 link back to the prescription copied into this snapshot. */
	@ManyToOne(() => PlannedExercise, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'planned_exercise_id' })
	plannedExercise: PlannedExercise;

	@Column({ name: 'exercise_id', type: 'uuid' })
	exerciseId: string;

	@ManyToOne(() => Exercise, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'exercise_id' })
	exercise: Exercise;

	@Column({ name: 'exercise_name', length: 150 })
	exerciseName: string;

	@Column({ type: 'smallint' })
	position: number;

	@OneToMany(() => LoggedSet, (set) => set.loggedExercise, {
		cascade: ['insert'],
	})
	sets: LoggedSet[];
}
