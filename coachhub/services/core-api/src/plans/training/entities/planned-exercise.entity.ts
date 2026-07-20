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
import { EquipmentType, ExerciseCategory, MuscleGroup } from '../../../common';
import { Exercise } from '../../../exercises/entities/exercise.entity';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { PlannedSet } from './planned-set.entity';
import { ProgramDay } from './program-day.entity';

/**
 * One dragged exercise on a day (design §4.4). Holds what is common to the
 * whole exercise — position, superset, rest, tempo, note. The set-by-set
 * prescription lives in `planned_sets`.
 */
@Entity('planned_exercises')
@Unique(['programDay', 'position'])
@Index('ix_planned_ex_day', ['programDayId'])
export class PlannedExercise {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'program_day_id', type: 'uuid' })
	programDayId: string;

	@ManyToOne(() => ProgramDay, (day) => day.exercises, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'program_day_id' })
	programDay: ProgramDay;

	@Column({ name: 'exercise_id', type: 'uuid' })
	exerciseId: string;

	@ManyToOne(() => Exercise, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'exercise_id' })
	exercise: Exercise;

	@Column({ name: 'exercise_name', length: 150 })
	exerciseName: string;

	@Column({
		type: 'enum',
		enum: ExerciseCategory,
		enumName: 'exercise_category',
	})
	category: ExerciseCategory;

	@Column({
		name: 'primary_muscle',
		type: 'enum',
		enum: MuscleGroup,
		enumName: 'muscle_group',
	})
	primaryMuscle: MuscleGroup;

	@Column({
		name: 'secondary_muscles',
		type: 'enum',
		enum: MuscleGroup,
		enumName: 'muscle_group',
		array: true,
		default: '{}',
	})
	secondaryMuscles: MuscleGroup[];

	@Column({
		type: 'enum',
		enum: EquipmentType,
		enumName: 'equipment_type',
		array: true,
		default: '{}',
	})
	equipment: EquipmentType[];

	@Column({ name: 'demo_video_url', type: 'text', nullable: true })
	demoVideoUrl: string | null;

	@Column({ name: 'demo_gif_url', type: 'text', nullable: true })
	demoGifUrl: string | null;

	@Column({ name: 'thumbnail_url', type: 'text', nullable: true })
	thumbnailUrl: string | null;

	@Column({
		name: 'instruction_steps',
		type: 'text',
		array: true,
		default: '{}',
	})
	instructionSteps: string[];

	@Column({ type: 'smallint' })
	position: number;

	/** Exercises sharing a value form a superset. */
	@Column({ name: 'superset_group', type: 'smallint', nullable: true })
	supersetGroup: number | null;

	/** Rest between sets. */
	@Column({ name: 'rest_seconds', type: 'int', default: 90 })
	restSeconds: number;

	@Column({ length: 7, nullable: true })
	tempo: string | null;

	/** The blue "Coach note" banner in the app. */
	@Column({ name: 'coach_notes', type: 'text', nullable: true })
	coachNotes: string | null;

	@OneToMany(() => PlannedSet, (set) => set.plannedExercise, {
		cascade: ['insert'],
	})
	sets: PlannedSet[];
}
