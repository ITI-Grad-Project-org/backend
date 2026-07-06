import {
	Check,
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { ProgramWeek } from './program-week.entity';
import { PlannedExercise } from './planned-exercise.entity';

@Entity('program_days')
@Unique(['programWeek', 'dayNumber'])
@Check(`"day_number" BETWEEN 1 AND 7`)
@Index('ix_program_days_week', ['programWeekId'])
export class ProgramDay {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'program_week_id', type: 'uuid' })
	programWeekId: string;

	@ManyToOne(() => ProgramWeek, (week) => week.days, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'program_week_id' })
	programWeek: ProgramWeek;

	@Column({ name: 'day_number', type: 'smallint' })
	dayNumber: number;

	@Column({ length: 150, nullable: true })
	name: string | null;

	@Column({ name: 'is_rest_day', default: false })
	isRestDay: boolean;

	@Column({ type: 'text', nullable: true })
	notes: string | null;

	@OneToMany(() => PlannedExercise, (exercise) => exercise.programDay)
	exercises: PlannedExercise[];
}
