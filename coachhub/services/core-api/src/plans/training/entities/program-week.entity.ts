import {
	Check,
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { Program } from './program.entity';
import { ProgramDay } from './program-day.entity';

@Entity('program_weeks')
@Unique(['program', 'weekNumber'])
@Check(`"week_number" >= 1`)
export class ProgramWeek {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'program_id', type: 'uuid' })
	programId: string;

	@ManyToOne(() => Program, (program) => program.weeks, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'program_id' })
	program: Program;

	@Column({ name: 'week_number', type: 'smallint' })
	weekNumber: number;

	@Column({ type: 'text', nullable: true })
	notes: string | null;

	@OneToMany(() => ProgramDay, (day) => day.programWeek, {
		cascade: ['insert'],
	})
	days: ProgramDay[];
}
