import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
}                          from 'typeorm';
import { Tenant }          from '../../../tenant/entities/tenant.entity';
import { Coach }           from '../../../coaches/entities/coach.entity';
import { ProgramWorkout }  from './program-workout.entity';
import {
	DifficultyLevel,
	FitnessGoal,
}                          from '../../../common';

/** The weekly grid the coach drags exercises onto (design §4.3). */
@Entity( 'programs' )
@Index( 'ix_programs_tenant', [ 'tenantId' ] )
export class Program {
	@PrimaryGeneratedColumn( 'uuid' )
	id: string;

	@Column( { name: 'tenant_id', type: 'uuid' } )
	tenantId: string;

	@ManyToOne( () => Tenant, { nullable: false, onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'tenant_id' } )
	tenant: Tenant;

	@ManyToOne( () => Coach, { nullable: false } )
	@JoinColumn( { name: 'created_by' } )
	createdBy: Coach;

	@Column( { length: 150 } )
	name: string;

	@Column( { type: 'text', nullable: true } )
	description: string | null;

	@Column( {
		type: 'enum',
		enum: FitnessGoal,
		enumName: 'fitness_goal',
		nullable: true,
	} )
	goal: FitnessGoal | null;

	@Column( {
		type: 'enum',
		enum: DifficultyLevel,
		enumName: 'difficulty_level',
		nullable: true,
	} )
	difficulty: DifficultyLevel | null;

	@Column( { name: 'duration_weeks', type: 'smallint', nullable: true } )
	durationWeeks: number | null;

	@Column( { name: 'is_template', default: true } )
	isTemplate: boolean;

	@Column( { name: 'is_archived', default: false } )
	isArchived: boolean;

	@OneToMany( () => ProgramWorkout, ( workout ) => workout.program )
	workouts: ProgramWorkout[];

	@CreateDateColumn( { name: 'created_at', type: 'timestamptz' } )
	createdAt: Date;

	@UpdateDateColumn( { name: 'updated_at', type: 'timestamptz' } )
	updatedAt: Date;
}
