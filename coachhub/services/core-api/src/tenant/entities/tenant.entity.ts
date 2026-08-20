import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Coach } from '../../coaches/entities/coach.entity';
import { SubscriptionPlan } from '../../billing/enums/subscription-plan.enum';

@Entity('tenants')
export class Tenant {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@ManyToOne(() => Coach, (coach) => coach.tenants, { nullable: false })
	@JoinColumn({ name: 'owner_coach_id' })
	ownerCoach: Coach;

	/** Business/brand name shown to clients. */
	@Column({ length: 150 })
	name: string;

	@Column({ unique: true })
	slug: string;

	@Column({ name: 'logo_url', type: 'text', nullable: true })
	logoUrl: string | null;

	/**
	 * Controls whether this coach shows up in the public directory and can
	 * receive join requests. Turning it off hides the coach from browsing but
	 * leaves existing clients untouched.
	 */
	@Column({ name: 'accepting_clients', default: true })
	acceptingClients: boolean;

	@Column({ length: 64, default: 'Africa/Cairo' })
	timezone: string;

	@Column({ type: 'char', length: 3, default: 'EGP' })
	currency: string;

	@Column({
		name: 'subscription_plan',
		type: 'enum',
		enum: SubscriptionPlan,
		enumName: 'subscription_plan',
		default: SubscriptionPlan.FREE,
	})
	subscriptionPlan: SubscriptionPlan;

	@Column({
		name: 'subscription_expires_at',
		type: 'timestamptz',
		nullable: true,
	})
	subscriptionExpiresAt: Date | null;

	@Column({ type: 'jsonb', default: () => `'{}'` })
	settings: Record<string, unknown>;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
