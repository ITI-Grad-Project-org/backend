import {
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { ClientMembership } from './client-membership.entity';
import { Gender, numericTransformer } from '../../common';

@Entity('clients')
export class Client {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ unique: true })
	email: string;

	@Column({ length: 20, unique: true, nullable: true })
	phone: string | null;

	@Column({
		name: 'password_hash',
		type: 'text',
		nullable: true,
		select: false,
	})
	password: string | null;

	@Column({ name: 'first_name', length: 100 })
	firstName: string;

	@Column({ name: 'last_name', length: 100, default: '' })
	lastName: string;

	@Column({ name: 'avatar_url', type: 'text', nullable: true })
	avatarUrl: string | null;

	@Column({ name: 'date_of_birth', type: 'date', nullable: true })
	dateOfBirth: string | null;

	@Column({
		type: 'enum',
		enum: Gender,
		enumName: 'gender_type',
		nullable: true,
	})
	gender: Gender | null;

	@Column({
		name: 'height_cm',
		type: 'numeric',
		precision: 5,
		scale: 1,
		nullable: true,
		transformer: numericTransformer,
	})
	heightCm: number | null;

	@Column({ nullable: true, unique: true })
	googleId: string | null;

	@Column({ name: 'is_email_verified', default: false })
	isEmailVerified: boolean;

	@Column({ name: 'is_phone_verified', default: false })
	isPhoneVerified: boolean;

	@Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
	lastLoginAt: Date | null;

	@Column({ type: 'text', nullable: true, select: false })
	hashedRefreshToken: string | null;

	@Column({ type: 'text', nullable: true, select: false })
	resetPasswordToken: string | null;

	@Column({ type: 'timestamptz', nullable: true, select: false })
	resetPasswordExpires: Date | null;

	@OneToMany(() => ClientMembership, (membership) => membership.client)
	memberships: ClientMembership[];

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;

	@DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
	deletedAt: Date | null;
}
