import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
}                              from 'typeorm';
import { InvitaionStatusEnum } from '../enums/invitaion-status.enum';
import { Client }              from '../../clients/entities/client.entity';
import { User }                from '../../users/entities/user.entity';
import { Tenant }              from '../../tenant/entities/tenant.entity';

@Entity()
export class Invitation {
	@PrimaryGeneratedColumn()
	id: number;

	@Column()
	email: string;

	@Column( { nullable: true } )
	clientName: string | null;

	@Column( {
		type: 'enum',
		enum: InvitaionStatusEnum,
		default: InvitaionStatusEnum.PENDING,
	} )
	status: InvitaionStatusEnum;

	@Index( { unique: true } )
	@Column()
	token: string;

	@Column( { type: 'timestamp' } )
	expiresAt: Date;

	@ManyToOne( () => User, ( user ) => user.id,
		{ nullable: false, onDelete: 'CASCADE' } )
	sender: User;

	@ManyToOne( () => Tenant, { nullable: false, onDelete: 'CASCADE' } )
	tenant: Tenant;

	/** Set when the invitation is accepted by a logged-in client. */
	@ManyToOne( () => Client, ( client ) => client.id, { nullable: true } )
	receiver: Client | null;

	@CreateDateColumn()
	created_at: Date;

	@UpdateDateColumn()
	updated_at: Date;
}
