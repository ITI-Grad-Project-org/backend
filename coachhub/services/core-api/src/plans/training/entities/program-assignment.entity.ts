import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import { Program } from './program.entity';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { AssignmentStatus } from '../../../common';

@Entity('program_assignments')
@Index('ux_active_assignment', ['membershipId'], {
	unique: true,
	where: `status = 'active'`,
})
export class ProgramAssignment {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'program_id', type: 'uuid' })
	programId: string;

	@ManyToOne(() => Program, { nullable: false })
	@JoinColumn({ name: 'program_id' })
	program: Program;

	@Column({ name: 'membership_id', type: 'uuid' })
	membershipId: string;

	@ManyToOne(() => ClientMembership, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'membership_id' })
	membership: ClientMembership;

	@Column({ name: 'start_date', type: 'date' })
	startDate: string;

	@Column({ name: 'end_date', type: 'date', nullable: true })
	endDate: string | null;

	@Column({
		type: 'enum',
		enum: AssignmentStatus,
		enumName: 'assignment_status',
		default: AssignmentStatus.SCHEDULED,
	})
	status: AssignmentStatus;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;
}
