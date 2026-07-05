import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { LoggedExercise } from './logged-exercise.entity';
import { numericTransformer } from '../../../common';

@Entity('logged_sets')
@Unique(['loggedExercise', 'setNumber'])
export class LoggedSet {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@ManyToOne(() => LoggedExercise, (exercise) => exercise.sets, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'logged_exercise_id' })
	loggedExercise: LoggedExercise;

	@Column({ name: 'set_number', type: 'smallint' })
	setNumber: number;

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

	@Column({ name: 'is_completed', default: true })
	isCompleted: boolean;
}
