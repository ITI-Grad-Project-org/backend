import {
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { CoachSpecialty } from '../../common';

export interface CoachCertification {
	name: string;
	issuer?: string;
	year?: number;
	credentialUrl?: string;
}

@Entity('coaches')
export class Coach {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ unique: true })
	email: string;

	/** E.164, used for WhatsApp OTP. */
	@Column({ length: 20, unique: true, nullable: true })
	phone: string | null;

	@Column({ name: 'password_hash', select: false })
	password: string;

	@Column({ name: 'first_name', length: 100 })
	firstName: string;

	@Column({ name: 'last_name', length: 100 })
	lastName: string;

	@Column({ name: 'avatar_url', type: 'text', nullable: true })
	avatarUrl: string | null;

	@Column({ type: 'text', nullable: true })
	bio: string | null;

	@Column({
		type: 'enum',
		enum: CoachSpecialty,
		enumName: 'coach_specialty',
		array: true,
		default: '{}',
	})
	specialties: CoachSpecialty[];

	@Column({ name: 'years_experience', type: 'smallint', nullable: true })
	yearsExperience: number | null;

	@Column({ type: 'jsonb', default: () => `'[]'` })
	certifications: CoachCertification[];

	@Column({ name: 'social_links', type: 'jsonb', default: () => `'{}'` })
	socialLinks: Record<string, string>;

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

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;

	@DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
	deletedAt: Date | null;

	@OneToMany(() => Tenant, (tenant) => tenant.ownerCoach)
	tenants: Tenant[];
}
