import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkoutSession } from './workout-session.entity';
import { WorkoutExercise } from './workout-exercise.entity';
import { Exercise } from '../../../exercises/entities/exercise.entity';
import { SetLog } from './set-log.entity';

@Entity('session_exercises')
export class SessionExercise {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'session_id', type: 'uuid' })
	sessionId: string;

	@ManyToOne(() => WorkoutSession, (session) => session.exercises, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'session_id' })
	session: WorkoutSession;

	/** Link back to the prescription that was being followed (if any). */
	@ManyToOne(() => WorkoutExercise, { nullable: true })
	@JoinColumn({ name: 'workout_exercise_id' })
	workoutExercise: WorkoutExercise | null;

	@Column({ name: 'exercise_id', type: 'uuid' })
	exerciseId: string;

	@ManyToOne(() => Exercise, { nullable: false })
	@JoinColumn({ name: 'exercise_id' })
	exercise: Exercise;

	@Column({ type: 'smallint' })
	position: number;

	@OneToMany(() => SetLog, (setLog) => setLog.sessionExercise, {
		cascade: ['insert'],
	})
	setLogs: SetLog[];
}
