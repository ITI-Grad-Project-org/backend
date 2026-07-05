import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Coach } from '../../coaches/entities/coach.entity';
import { DefaultExercise } from './default-exercise.entity';
import { EquipmentType, ExerciseCategory, MuscleGroup } from '../../common';

/**
 * Per-coach exercise library (design §4.2) — definition only, NO sets/reps/
 * weight; the prescription lives on `planned_exercises`. Every exercise
 * belongs to exactly one tenant; default exercises are copied in at tenant
 * creation and the coach owns his copies outright.
 */
@Entity('exercises')
@Index('ux_exercises_tenant_name', ['tenantId', 'name'], { unique: true })
@Index('ix_exercises_library', ['tenantId', 'category'])
export class Exercise {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	/** NULL = seeded row (not coach-created). */
	@ManyToOne(() => Coach, { nullable: true })
	@JoinColumn({ name: 'created_by' })
	createdBy: Coach | null;

	/** Lineage back to the system starter set. */
	@ManyToOne(() => DefaultExercise, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'source_seed_id' })
	sourceSeed: DefaultExercise | null;

	@Column({ length: 150 })
	name: string;

	@Column({
		type: 'enum',
		enum: ExerciseCategory,
		enumName: 'exercise_category',
	})
	category: ExerciseCategory;

	/** The "HAMSTRINGS" label in the UI. */
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

	/** Video and GIF are independent and both optional (design media rule). */
	@Column({ name: 'demo_video_url', type: 'text', nullable: true })
	demoVideoUrl: string | null;

	@Column({ name: 'demo_gif_url', type: 'text', nullable: true })
	demoGifUrl: string | null;

	@Column({ name: 'thumbnail_url', type: 'text', nullable: true })
	thumbnailUrl: string | null;

	/** Ordered steps → renders as the numbered 1/2/3/4 list in the app. */
	@Column({
		name: 'instruction_steps',
		type: 'text',
		array: true,
		default: '{}',
	})
	instructionSteps: string[];

	@Column({ name: 'is_active', default: true })
	isActive: boolean;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
