import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { ClientMembership } from '../../clients/entities/client-membership.entity';
import { Client } from '../../clients/entities/client.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { ActivityType } from '../enums/activity-type.enum';

@Entity('activity_logs')
@Unique('uq_activity_logs_client_type_source', [
	'clientId',
	'activityType',
	'sourceKey',
])
@Index('ix_activity_logs_client_date', ['clientId', 'activityDate'])
export class ActivityLog {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'client_id', type: 'uuid' })
	clientId: string;

	@ManyToOne(() => Client, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'client_id' })
	client: Client;

	@Column({ name: 'tenant_id', type: 'uuid', nullable: true })
	tenantId: string | null;

	@ManyToOne(() => Tenant, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant | null;

	@Column({ name: 'membership_id', type: 'uuid', nullable: true })
	membershipId: string | null;

	@ManyToOne(() => ClientMembership, {
		nullable: true,
		onDelete: 'SET NULL',
	})
	@JoinColumn({ name: 'membership_id' })
	membership: ClientMembership | null;

	@Column({
		name: 'activity_type',
		type: 'enum',
		enum: ActivityType,
		enumName: 'activity_type',
	})
	activityType: ActivityType;

	@Column({ name: 'source_key', length: 160 })
	sourceKey: string;

	@Column({ name: 'activity_date', type: 'date' })
	activityDate: string;

	@Column({ name: 'occurred_at', type: 'timestamptz' })
	occurredAt: Date;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;
}
