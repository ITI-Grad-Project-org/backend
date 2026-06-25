import {
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	JoinColumn,
	OneToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn
}                 from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity()
export class User {
	@PrimaryGeneratedColumn()
	id: number;

	@Column()
	name: string;

	@Column( { unique: true } )
	email: string;

	@Column( { select: false } )
	password: string;

	@Column()
	phoneNumber: string;

	@Column( { nullable: true } )
	whatsappNumber?: string;

	@Column( { default: null, select: false } )
	hashedRefreshToken: string;

	@Column( { default: null, select: false } )
	resetPasswordToken: string;

	@Column( { default: null, select: false } )
	resetPasswordExpires: Date;

	@CreateDateColumn()
	created_at: Date;

	@UpdateDateColumn()
	updated_at: Date;

	@DeleteDateColumn()
	deleted_at: Date;

	@OneToOne( () => Tenant, ( tenant ) => tenant.user,
		{ cascade: true, onDelete: 'CASCADE' } )
	@JoinColumn( { name: 'tenant_id' } )
	tenant: Tenant;
}
