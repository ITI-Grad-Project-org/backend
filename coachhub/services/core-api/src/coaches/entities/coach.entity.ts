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
import {
	CoachSpecialty,
	Gender,
	numericTransformer,
	OfflineAvailability,
} from '../../common';

export interface CoachCertification {
	id?: string;
	name: string;
	issuer?: string;
	issueDate?: string;
	expiryDate?: string;
	fileUrl?: string;
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

	// ── Step 1: About you ────────────────────────────────────────────────────
	@Column({ type: 'smallint', nullable: true })
	age: number | null;

	@Column({
		type: 'enum',
		enum: Gender,
		enumName: 'gender_type',
		nullable: true,
	})
	gender: Gender | null;

	/** Free-text city/country as typed, e.g. "Lisbon, PT". */
	@Column({ type: 'text', nullable: true })
	location: string | null;

	// ── Step 2: Your craft ───────────────────────────────────────────────────
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

	@Column({ name: 'career_experience', type: 'text', nullable: true })
	careerExperience: string | null;

	// ── Step 3: Certifications ───────────────────────────────────────────────
	@Column({ type: 'jsonb', default: () => `'[]'` })
	certifications: CoachCertification[];

	// ── Step 4: Proof & portfolio ────────────────────────────────────────────
	@Column({ name: 'portfolio_url', type: 'text', nullable: true })
	portfolioUrl: string | null;

	@Column({
		name: 'transformation_photos',
		type: 'text',
		array: true,
		default: '{}',
	})
	transformationPhotos: string[];

	@Column({ name: 'featured_reviews', type: 'text', nullable: true })
	featuredReviews: string | null;

	// ── Step 5: Availability & pricing ───────────────────────────────────────
	@Column({
		name: 'offline_availability',
		type: 'enum',
		enum: OfflineAvailability,
		enumName: 'offline_availability',
		nullable: true,
	})
	offlineAvailability: OfflineAvailability | null;

	/** Free-text for now, e.g. "Mon–Fri · 7 AM – 7 PM". */
	@Column({ name: 'availability_hours', type: 'text', nullable: true })
	availabilityHours: string | null;

	@Column({
		name: 'price_from',
		type: 'numeric',
		precision: 10,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	priceFrom: number | null;

	@Column({
		name: 'price_to',
		type: 'numeric',
		precision: 10,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	priceTo: number | null;

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

	// Stage 1 of password reset: hashed 6-digit OTP emailed to the coach.
	@Column({ type: 'text', nullable: true, select: false })
	resetOtpHash: string | null;

	@Column({ type: 'timestamptz', nullable: true, select: false })
	resetOtpExpires: Date | null;

	// Wrong-code counter — a 6-digit OTP is brute-forceable, so it is capped.
	@Column({ type: 'int', default: 0, select: false })
	resetOtpAttempts: number;

	// Stage 2: single-use ticket handed out once the OTP verifies.
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
