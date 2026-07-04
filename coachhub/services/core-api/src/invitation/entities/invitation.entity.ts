import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { InvitaionStatusEnum } from '../enums/invitaion-status.enum';
import { Client } from '../../clients/entities/client.entity';
import { Coach } from '../../coaches/entities/coach.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('invitations')
export class Invitation {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column()
	email: string;

	@Column({ nullable: true })
	clientName: string | null;

	@Column({
		type: 'enum',
		enum: InvitaionStatusEnum,
		default: InvitaionStatusEnum.PENDING,
	})
	status: InvitaionStatusEnum;

	@Index({ unique: true })
	@Column()
	token: string;

	@Column({ type: 'timestamptz' })
	expiresAt: Date;

	@ManyToOne(() => Coach, { nullable: false, onDelete: 'CASCADE' })
	sender: Coach;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	tenant: Tenant;

	/** Set when the invitation is accepted by a logged-in client. */
	@ManyToOne(() => Client, { nullable: true })
	receiver: Client | null;

	@CreateDateColumn()
	created_at: Date;

	@UpdateDateColumn()
	updated_at: Date;
}
