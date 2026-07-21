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

	/** Internal opaque identifier — no longer emailed now the code replaced links. */
	@Index({ unique: true })
	@Column()
	token: string;

	// The client accepts by typing a 6-digit code from the invite email; only its
	// hash is stored, and wrong guesses are capped so the short code can't be
	// brute-forced. `expiresAt` doubles as the code's validity window.
	@Column({ type: 'text', nullable: true, select: false })
	otpHash: string | null;

	@Column({ type: 'int', default: 0, select: false })
	otpAttempts: number;

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
