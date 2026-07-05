import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
} from 'typeorm';
import { LoggedWorkout } from './logged-workout.entity';
import { PlannedExercise } from './planned-exercise.entity';
import { Exercise } from '../../../exercises/entities/exercise.entity';
import { LoggedSet } from './logged-set.entity';

@Entity('logged_exercises')
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

	/** Back to the prescription this exercise was following. */
	@ManyToOne(() => PlannedExercise, { nullable: true })
	@JoinColumn({ name: 'planned_exercise_id' })
	plannedExercise: PlannedExercise | null;

	@Column({ name: 'exercise_id', type: 'uuid' })
	exerciseId: string;

	@ManyToOne(() => Exercise, { nullable: false })
	@JoinColumn({ name: 'exercise_id' })
	exercise: Exercise;

	@Column({ type: 'smallint' })
	position: number;

	@OneToMany(() => LoggedSet, (set) => set.loggedExercise, {
		cascade: ['insert'],
	})
	sets: LoggedSet[];
}
