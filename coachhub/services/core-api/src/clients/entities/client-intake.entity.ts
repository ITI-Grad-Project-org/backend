import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { ClientMembership } from './client-membership.entity';
import {
	ActivityLevel,
	DietaryPreference,
	EquipmentType,
	FitnessGoal,
	TrainingExperience,
} from '../../common';

@Entity('client_intakes')
export class ClientIntake {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@OneToOne(() => ClientMembership, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'membership_id' })
	membership: ClientMembership;

	@Column({ type: 'enum', enum: FitnessGoal, enumName: 'fitness_goal' })
	goal: FitnessGoal;

	@Column({
		name: 'activity_level',
		type: 'enum',
		enum: ActivityLevel,
		enumName: 'activity_level',
	})
	activityLevel: ActivityLevel;

	@Column({
		name: 'training_experience',
		type: 'enum',
		enum: TrainingExperience,
		enumName: 'training_experience',
	})
	trainingExperience: TrainingExperience;

	@Column({
		name: 'training_days_per_week',
		type: 'smallint',
		nullable: true,
	})
	trainingDaysPerWeek: number | null;

	@Column({
		name: 'available_equipment',
		type: 'enum',
		enum: EquipmentType,
		enumName: 'equipment_type',
		array: true,
		default: '{}',
	})
	availableEquipment: EquipmentType[];

	@Column({
		name: 'dietary_preferences',
		type: 'enum',
		enum: DietaryPreference,
		enumName: 'dietary_preference',
		array: true,
		default: '{}',
	})
	dietaryPreferences: DietaryPreference[];

	@Column({ type: 'text', array: true, nullable: true })
	allergies: string[] | null;

	@Column({ name: 'medical_conditions', type: 'text', nullable: true })
	medicalConditions: string | null;

	@Column({ type: 'text', nullable: true })
	injuries: string | null;

	@Column({ type: 'text', nullable: true })
	notes: string | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
