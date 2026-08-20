import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { PaymentAttemptStatus } from '../enums/payment-attempt-status.enum';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';

@Entity('payment_attempts')
export class PaymentAttempt {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({
		type: 'enum',
		enum: SubscriptionPlan,
		enumName: 'subscription_plan',
	})
	plan: SubscriptionPlan;

	@Column({ name: 'amount_cents', type: 'int' })
	amountCents: number;

	@Column({ type: 'char', length: 3, default: 'EGP' })
	currency: string;

	@Column({
		type: 'enum',
		enum: PaymentAttemptStatus,
		enumName: 'payment_attempt_status',
		default: PaymentAttemptStatus.PENDING,
	})
	status: PaymentAttemptStatus;

	@Column({ name: 'paymob_intention_id', type: 'text', nullable: true })
	paymobIntentionId: string | null;

	@Column({
		name: 'paymob_transaction_id',
		type: 'text',
		nullable: true,
		unique: true,
	})
	paymobTransactionId: string | null;

	@Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
	paidAt: Date | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
