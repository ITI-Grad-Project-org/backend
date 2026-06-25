import {
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
}               from 'typeorm';
import { Tenant }     from '../../tenant/entities/tenant.entity';
import { UserStatus } from '../../auth/enums';

@Entity()
export class Client {
	@PrimaryGeneratedColumn()
	id: number;

	@Column()
	name: string;

	@Column( { unique: true } )
	email: string;

	@Column( { nullable: true, select: false } )
	password: string;

	@Column( { nullable: true, unique: true } )
	googleId: string;

	@Column( { nullable: true } )
	profilePicture: string;

	@Column( { type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE } )
	status: UserStatus;

	@Column( { nullable: true } )
	blockReason: string;

	@Column( { nullable: true, select: false } )
	hashedRefreshToken: string;

	@Column( { nullable: true, select: false } )
	resetPasswordToken: string;

	@Column( { nullable: true, select: false } )
	resetPasswordExpires: Date;

	@Column( { nullable: true } )
	lastLoginAt: Date;

	@ManyToOne( () => Tenant, { nullable: true } )
	@JoinColumn( { name: 'tenant_id' } )
	tenant: Tenant | null;

	@CreateDateColumn()
	created_at: Date;

	@UpdateDateColumn()
	updated_at: Date;

	@DeleteDateColumn()
	deleted_at: Date;
}
