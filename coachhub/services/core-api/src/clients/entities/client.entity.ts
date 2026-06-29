import {
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
}                           from 'typeorm';
import { ClientMembership } from './client-membership.entity';

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

	@Column( { nullable: true, select: false } )
	hashedRefreshToken: string;

	@Column( { nullable: true, select: false } )
	resetPasswordToken: string;

	@Column( { nullable: true, select: false } )
	resetPasswordExpires: Date;

	@Column( { nullable: true } )
	lastLoginAt: Date;

	@OneToMany( () => ClientMembership, ( membership ) => membership.client )
	memberships: ClientMembership[];

	@CreateDateColumn()
	created_at: Date;

	@UpdateDateColumn()
	updated_at: Date;

	@DeleteDateColumn()
	deleted_at: Date;
}
