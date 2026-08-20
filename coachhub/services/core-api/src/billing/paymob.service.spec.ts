import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { ConfigService } from '../config';
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

describe('PaymobService', () => {
	const hmacSecret = 'test-hmac-secret';
	const service = new PaymobService({
		paymobConfig: { hmacSecret, cardIntegrationId: 5863435 },
	} as unknown as ConfigService);

	it('accepts a valid Paymob transaction HMAC', () => {
		const concatenatedValues =
			'29900' +
			'2026-08-20T05:00:00.000000' +
			'EGP' +
			'false' +
			'false' +
			'12345' +
			'5863435' +
			'true' +
			'false' +
			'false' +
			'false' +
			'true' +
			'false' +
			'9876' +
			'111' +
			'false' +
			'2346' +
			'MasterCard' +
			'card' +
			'true';
		const hmac = createHmac('sha512', hmacSecret)
			.update(concatenatedValues)
			.digest('hex');

		expect(() =>
			service.verifyTransactionHmac(transaction, hmac),
		).not.toThrow();
	});

	it('rejects a callback with a false HMAC', () => {
		expect(() =>
			service.verifyTransactionHmac(transaction, 'not-valid'),
		).toThrow(UnauthorizedException);
	});

	it('checks that callbacks use the configured card integration', () => {
		expect(service.isConfiguredCardIntegration(5863435)).toBe(true);
		expect(service.isConfiguredCardIntegration(999)).toBe(false);
	});
});
