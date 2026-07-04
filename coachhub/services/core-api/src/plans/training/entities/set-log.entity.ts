import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { SessionExercise } from './session-exercise.entity';
import { numericTransformer } from '../../../common';

@Entity('set_logs')
@Unique(['sessionExercise', 'setNumber'])
export class SetLog {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@ManyToOne(() => SessionExercise, (exercise) => exercise.setLogs, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'session_exercise_id' })
	sessionExercise: SessionExercise;

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
