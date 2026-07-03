import {
	Check,
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	Unique,
}                          from 'typeorm';
import { Tenant }          from '../../../tenant/entities/tenant.entity';
import { Program }         from './program.entity';
import { WorkoutExercise } from './workout-exercise.entity';

/**
 * One row per workout-day cell in the grid (design §4.3). Created lazily: the
 * first drop onto an empty (week, day) cell creates the program_workout, then
 * attaches the workout_exercise to it.
 */
@Entity( 'program_workouts' )
@Unique( [ 'program', 'weekNumber', 'dayNumber' ] )
@Check( `"day_number" BETWEEN 1 AND 7` )
export class ProgramWorkout {
	@PrimaryGeneratedColumn( 'uuid' )
	id: string;

	@Column( { name: 'tenant_id', type: 'uuid' } )
	tenantId: string;

	@ManyToOne( () => Tenant, { nullable: false, onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'tenant_id' } )
	tenant: Tenant;

	@Column( { name: 'program_id', type: 'uuid' } )
	programId: string;

	@ManyToOne( () => Program, ( program ) => program.workouts,
		{ nullable: false, onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'program_id' } )
	program: Program;

	/** Optional "Push Day A"; can be auto "Monday". */
	@Column( { length: 150, nullable: true } )
	name: string | null;

	@Column( { name: 'week_number', type: 'smallint', default: 1 } )
	weekNumber: number;

	@Column( { name: 'day_number', type: 'smallint' } )
	dayNumber: number;

	@Column( { type: 'text', nullable: true } )
	notes: string | null;

	@OneToMany( () => WorkoutExercise, ( exercise ) => exercise.programWorkout )
	exercises: WorkoutExercise[];
}
