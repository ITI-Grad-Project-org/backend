import { DataSource, Repository } from 'typeorm';

jest.mock('../coaches/coaches.service', () => ({
	CoachesService: class CoachesService {},
}));

import { CoachesService } from '../coaches/coaches.service';
import { Tenant } from '../tenant/entities/tenant.entity';
import { BillingService } from './billing.service';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentAttemptStatus } from './enums/payment-attempt-status.enum';
import { SubscriptionPlan } from './enums/subscription-plan.enum';
import { EntitlementService } from './entitlement.service';
import { PaymobService, PaymobTransaction } from './paymob.service';

const transaction: PaymobTransaction = {
	amount_cents: 29900,
	created_at: '2026-08-20T05:00:00.000000',
	currency: 'EGP',
	error_occured: false,
	has_parent_transaction: false,
	id: 12345,
	integration_id: 5863435,
	is_3d_secure: true,
	is_auth: false,
	is_capture: false,
	is_refunded: false,
	is_standalone_payment: true,
	is_voided: false,
	order: { id: 9876, merchant_order_id: 'attempt-1' },
	owner: 111,
	pending: false,
	source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
	success: true,
};

describe('BillingService Paymob webhook', () => {
	let attempt: PaymentAttempt;
	let attemptRepository: {
		createQueryBuilder: jest.Mock;
		save: jest.Mock;
	};
	let tenantRepository: { update: jest.Mock };
	let paymobService: {
		verifyTransactionHmac: jest.Mock;
		isConfiguredCardIntegration: jest.Mock;
	};
	let service: BillingService;

	beforeEach(() => {
		attempt = {
			id: 'attempt-1',
			plan: SubscriptionPlan.SOLO,
			amountCents: 29900,
			currency: 'EGP',
			status: PaymentAttemptStatus.PENDING,
			paymobTransactionId: null,
			paidAt: null,
			tenant: {
				id: 'tenant-1',
				subscriptionPlan: SubscriptionPlan.FREE,
				subscriptionExpiresAt: null,
			} as Tenant,
		} as PaymentAttempt;
		const queryBuilder = {
			innerJoinAndSelect: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			setLock: jest.fn().mockReturnThis(),
			getOne: jest.fn().mockResolvedValue(attempt),
		};
		attemptRepository = {
			createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
			save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
		};
		tenantRepository = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
		paymobService = {
			verifyTransactionHmac: jest.fn(),
			isConfiguredCardIntegration: jest.fn().mockReturnValue(true),
		};

		const manager = {
			getRepository: jest.fn((entity) =>
				entity === PaymentAttempt ? attemptRepository : tenantRepository,
			),
		};
		const dataSource = {
			transaction: jest.fn((work) => work(manager)),
		};

		service = new BillingService(
			{} as Repository<PaymentAttempt>,
			{} as Repository<Tenant>,
			{} as CoachesService,
			paymobService as unknown as PaymobService,
			{} as EntitlementService,
			dataSource as unknown as DataSource,
		);
	});

	it('activates the plan only after signature and payment checks pass', async () => {
		const before = Date.now();

		await service.handlePaymobWebhook({ obj: transaction }, 'valid-hmac');

		expect(paymobService.verifyTransactionHmac).toHaveBeenCalledWith(
			transaction,
			'valid-hmac',
		);
		expect(attempt.status).toBe(PaymentAttemptStatus.SUCCEEDED);
		expect(attempt.paymobTransactionId).toBe('12345');
		expect(tenantRepository.update).toHaveBeenCalledWith(
			'tenant-1',
			expect.objectContaining({ subscriptionPlan: SubscriptionPlan.SOLO }),
		);
		const update = tenantRepository.update.mock.calls[0][1];
		const expectedDurationMs = 30 * 24 * 60 * 60 * 1000;
		expect(update.subscriptionExpiresAt.getTime()).toBeGreaterThanOrEqual(
			before + expectedDurationMs,
		);
	});

	it('does not extend access twice for a repeated successful callback', async () => {
		attempt.status = PaymentAttemptStatus.SUCCEEDED;

		const result = await service.handlePaymobWebhook(
			{ obj: transaction },
			'valid-hmac',
		);

		expect(result).toEqual({ received: true, duplicate: true });
		expect(tenantRepository.update).not.toHaveBeenCalled();
	});

	it('records a verified failed payment without unlocking the plan', async () => {
		const failedTransaction = { ...transaction, success: false };

		await service.handlePaymobWebhook({ obj: failedTransaction }, 'valid-hmac');

		expect(attempt.status).toBe(PaymentAttemptStatus.FAILED);
		expect(tenantRepository.update).not.toHaveBeenCalled();
	});
});
