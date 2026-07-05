import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { EquipmentType, ExerciseCategory, MuscleGroup } from '../../common';

/**
 * System starter set (design §4.1) — maintained via migrations/admin, never
 * exposed to coach-facing endpoints. Its only job is to be COPIED into a new
 * tenant's `exercises` library at tenant creation.
 */
@Entity('default_exercises')
export class DefaultExercise {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Index({ unique: true })
	@Column({ length: 150 })
	name: string;

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

	/** FALSE = stop copying into NEW tenants (existing copies are untouched). */
	@Column({ name: 'is_active', default: true })
	isActive: boolean;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
