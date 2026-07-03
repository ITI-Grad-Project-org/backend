import {
	Check,
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
}                             from 'typeorm';
import { Tenant }             from '../../../tenant/entities/tenant.entity';
import { ProgramWorkout }     from './program-workout.entity';
import { Exercise }           from '../../../exercises/entities/exercise.entity';
import { numericTransformer } from '../../../common';

/**
 * One dragged exercise — THE DROP POPUP WRITES HERE (design §4.4). This is
 * the prescription (sets/reps/weight); the definition stays in `exercises`.
 */
@Entity( 'workout_exercises' )
@Unique( [ 'programWorkout', 'position' ] )
@Check( `"sets" BETWEEN 1 AND 20` )
@Check( `"reps_min" IS NOT NULL OR "duration_seconds" IS NOT NULL` )
export class WorkoutExercise {
	@PrimaryGeneratedColumn( 'uuid' )
	id: string;

	@Column( { name: 'tenant_id', type: 'uuid' } )
	tenantId: string;

	@ManyToOne( () => Tenant, { nullable: false, onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'tenant_id' } )
	tenant: Tenant;

	@Column( { name: 'program_workout_id', type: 'uuid' } )
	programWorkoutId: string;

	@ManyToOne( () => ProgramWorkout, ( workout ) => workout.exercises,
		{ nullable: false, onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'program_workout_id' } )
	programWorkout: ProgramWorkout;

	@Column( { name: 'exercise_id', type: 'uuid' } )
	exerciseId: string;

	@ManyToOne( () => Exercise, { nullable: false } )
	@JoinColumn( { name: 'exercise_id' } )
	exercise: Exercise;

	@Column( { type: 'smallint' } )
	position: number;

	@Column( { name: 'superset_group', type: 'smallint', nullable: true } )
	supersetGroup: number | null;

	// ↓ prescription (popup fields)
	@Column( { type: 'smallint' } )
	sets: number;

	@Column( { name: 'reps_min', type: 'smallint', nullable: true } )
	repsMin: number | null;

	@Column( { name: 'reps_max', type: 'smallint', nullable: true } )
	repsMax: number | null;

	/** Time-based alternative (planks, cardio). */
	@Column( { name: 'duration_seconds', type: 'int', nullable: true } )
	durationSeconds: number | null;

	/** "70 kg" in the UI; NULL = bodyweight / coach left it open. */
	@Column( {
		name: 'weight_kg',
		type: 'numeric',
		precision: 6,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	} )
	weightKg: number | null;

	@Column( { name: 'rest_seconds', type: 'int', default: 90 } )
	restSeconds: number;

	/** e.g. "3-1-1-0". */
	@Column( { length: 7, nullable: true } )
	tempo: string | null;

	@Column( {
		name: 'target_rpe',
		type: 'numeric',
		precision: 3,
		scale: 1,
		nullable: true,
		transformer: numericTransformer,
	} )
	targetRpe: number | null;

	/** The blue "Coach note" banner in the app. */
	@Column( { name: 'coach_notes', type: 'text', nullable: true } )
	coachNotes: string | null;
}
