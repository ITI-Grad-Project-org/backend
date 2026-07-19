import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { Coach } from '../../../coaches/entities/coach.entity';
import {
	DifficultyLevel,
	FitnessGoal,
	ProgramStatus,
	ProgramType,
} from '../../../common';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { ProgramWeek } from './program-week.entity';

@Entity('programs')
@Index('ix_programs_tenant', ['tenantId'])
@Index('ix_programs_membership', ['membershipId'])
@Check(
	'ck_programs_client_template_shape',
	`("program_type" = 'client' AND "membership_id" IS NOT NULL AND "start_date" IS NOT NULL AND "end_date" IS NOT NULL) OR ("program_type" = 'template' AND "membership_id" IS NULL AND "start_date" IS NULL AND "end_date" IS NULL)`,
)
@Check('ck_programs_duration_weeks', `"duration_weeks" BETWEEN 1 AND 52`)
@Check(
	'ck_programs_inclusive_dates',
	`"program_type" <> 'client' OR "end_date" = "start_date" + ("duration_weeks" * 7 - 1)`,
)
@Check(
	'ck_programs_source_template_not_self',
	`"source_template_id" IS NULL OR "source_template_id" <> "id"`,
)
export class Program {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@ManyToOne(() => Coach, { nullable: false })
	@JoinColumn({ name: 'created_by' })
	createdBy: Coach;

	@Column({
		name: 'program_type',
		type: 'enum',
		enum: ProgramType,
		enumName: 'program_type',
		default: ProgramType.CLIENT,
	})
	programType: ProgramType;

	@Column({ name: 'membership_id', type: 'uuid', nullable: true })
	membershipId: string | null;

	@ManyToOne(() => ClientMembership, { nullable: true, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'membership_id' })
	membership: ClientMembership | null;

	@Column({ name: 'source_template_id', type: 'uuid', nullable: true })
	sourceTemplateId: string | null;

	@ManyToOne(() => Program, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'source_template_id' })
	sourceTemplate: Program | null;

	@Column({ length: 150 })
	name: string;

	@Column({ type: 'text', nullable: true })
	description: string | null;

	@Column({
		type: 'enum',
		enum: FitnessGoal,
		enumName: 'fitness_goal',
		nullable: true,
	})
	goal: FitnessGoal | null;

	@Column({
		type: 'enum',
		enum: DifficultyLevel,
		enumName: 'difficulty_level',
		nullable: true,
	})
	difficulty: DifficultyLevel | null;

	@Column({ name: 'duration_weeks', type: 'smallint' })
	durationWeeks: number;

	@Column({ name: 'start_date', type: 'date', nullable: true })
	startDate: string | null;

	@Column({ name: 'end_date', type: 'date', nullable: true })
	endDate: string | null;

	@Column({
		type: 'enum',
		enum: ProgramStatus,
		enumName: 'program_status',
		default: ProgramStatus.DRAFT,
	})
	status: ProgramStatus;

	@Column({ name: 'is_archived', default: false })
	isArchived: boolean;

	@OneToMany(() => ProgramWeek, (week) => week.program, {
		cascade: ['insert'],
	})
	weeks: ProgramWeek[];

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
