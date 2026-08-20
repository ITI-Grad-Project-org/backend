import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CoachesService } from '../coaches/coaches.service';
import { Tenant } from '../tenant/entities/tenant.entity';
import {
	PAID_PLANS,
	PLAN_DEFINITIONS,
	SUBSCRIPTION_DURATION_DAYS,
} from './billing.constants';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { EntitlementService } from './entitlement.service';
import { PaymentAttemptStatus } from './enums/payment-attempt-status.enum';
import { SubscriptionPlan } from './enums/subscription-plan.enum';
import { PaymobService, PaymobTransaction } from './paymob.service';

@Injectable()
export class BillingService {
	constructor(
		@InjectRepository(PaymentAttempt)
		private readonly paymentAttemptRepository: Repository<PaymentAttempt>,
		@InjectRepository(Tenant)
		private readonly tenantRepository: Repository<Tenant>,
		private readonly coachesService: CoachesService,
		private readonly paymobService: PaymobService,
		private readonly entitlementService: EntitlementService,
		private readonly dataSource: DataSource,
	) {}

	getPlans() {
		return Object.values(PLAN_DEFINITIONS);
	}

	getBillingSummary(tenantId: string) {
		return this.entitlementService.getBillingSummary(tenantId);
	}

	async createCheckout(
		coachId: string,
		tenantId: string,
		dto: CreateCheckoutDto,
	) {
		if (!PAID_PLANS.includes(dto.plan)) {
			throw new BadRequestException('Only Solo and Studio can be purchased');
		}

		const [tenant, coach] = await Promise.all([
			this.tenantRepository.findOne({ where: { id: tenantId } }),
			this.coachesService.findProfileById(coachId),
		]);
		if (!tenant) {
			throw new NotFoundException('Tenant not found');
		}
		if (!coach || !coach.tenants.some((item) => item.id === tenantId)) {
			throw new ForbiddenException('This tenant does not belong to this coach');
		}

		const currentPlan = this.entitlementService.getEffectivePlan(tenant);
		if (
			currentPlan === SubscriptionPlan.STUDIO &&
			dto.plan === SubscriptionPlan.SOLO
		) {
			throw new ConflictException(
				'An active Studio subscription cannot be changed to Solo',
			);
		}

		const plan = PLAN_DEFINITIONS[dto.plan];
		const attempt = await this.paymentAttemptRepository.save(
			this.paymentAttemptRepository.create({
				tenant: { id: tenantId },
				plan: dto.plan,
				amountCents: plan.priceCents,
				currency: plan.currency,
				status: PaymentAttemptStatus.PENDING,
			}),
		);

		try {
			const checkout = await this.paymobService.createCheckout(
				attempt.id,
				plan,
				coach,
			);
			await this.paymentAttemptRepository.update(attempt.id, {
				paymobIntentionId: checkout.intentionId,
			});
			return {
				paymentAttemptId: attempt.id,
				checkoutUrl: checkout.checkoutUrl,
			};
		} catch (error) {
			await this.paymentAttemptRepository.update(attempt.id, {
				status: PaymentAttemptStatus.FAILED,
			});
			throw error;
		}
	}

	async getPaymentAttempt(tenantId: string, attemptId: string) {
		const attempt = await this.paymentAttemptRepository.findOne({
			where: { id: attemptId, tenant: { id: tenantId } },
		});
		if (!attempt) {
			throw new NotFoundException('Payment attempt not found');
		}
		return {
			id: attempt.id,
			plan: attempt.plan,
			amountCents: attempt.amountCents,
			currency: attempt.currency,
			status: attempt.status,
			paidAt: attempt.paidAt,
			createdAt: attempt.createdAt,
		};
	}

	async handlePaymobWebhook(body: { obj?: PaymobTransaction }, hmac: string) {
		const transaction = body?.obj;
		if (!transaction) {
			throw new BadRequestException('Missing Paymob transaction');
		}
		this.paymobService.verifyTransactionHmac(transaction, hmac);

		const attemptId = transaction.order?.merchant_order_id;
		if (!attemptId) {
			throw new BadRequestException('Missing payment reference');
		}

		return this.dataSource.transaction(async (manager) => {
			const attemptRepository = manager.getRepository(PaymentAttempt);
			const attempt = await attemptRepository
				.createQueryBuilder('attempt')
				.innerJoinAndSelect('attempt.tenant', 'tenant')
				.where('attempt.id = :attemptId', { attemptId })
				.setLock('pessimistic_write')
				.getOne();
			if (!attempt) {
				throw new NotFoundException('Payment attempt not found');
			}

			this.assertTransactionMatchesAttempt(transaction, attempt);
			if (attempt.status === PaymentAttemptStatus.SUCCEEDED) {
				return { received: true, duplicate: true };
			}

			const paymentSucceeded =
				transaction.success === true &&
				transaction.pending === false &&
				transaction.is_refunded !== true &&
				transaction.is_voided !== true;

			if (!paymentSucceeded) {
				attempt.status = PaymentAttemptStatus.FAILED;
				await attemptRepository.save(attempt);
				return { received: true, subscriptionActivated: false };
			}

			const now = new Date();
			const currentExpiry = attempt.tenant.subscriptionExpiresAt;
			const extensionStartsAt =
				currentExpiry && currentExpiry.getTime() > now.getTime()
					? currentExpiry
					: now;
			const newExpiry = new Date(
				extensionStartsAt.getTime() +
					SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000,
			);

			attempt.status = PaymentAttemptStatus.SUCCEEDED;
			attempt.paymobTransactionId = String(transaction.id);
			attempt.paidAt = now;
			await attemptRepository.save(attempt);
			await manager.getRepository(Tenant).update(attempt.tenant.id, {
				subscriptionPlan: attempt.plan,
				subscriptionExpiresAt: newExpiry,
			});

			return { received: true, subscriptionActivated: true };
		});
	}

	private assertTransactionMatchesAttempt(
		transaction: PaymobTransaction,
		attempt: PaymentAttempt,
	): void {
		if (
			!this.paymobService.isConfiguredCardIntegration(
				transaction.integration_id,
			)
		) {
			throw new BadRequestException('Unexpected Paymob integration');
		}
		if (Number(transaction.amount_cents) !== attempt.amountCents) {
			throw new BadRequestException('Payment amount does not match checkout');
		}
		if (transaction.currency !== attempt.currency) {
			throw new BadRequestException('Payment currency does not match checkout');
		}
	}
}
