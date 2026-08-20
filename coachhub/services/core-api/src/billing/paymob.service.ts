import {
	BadGatewayException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '../config';
import { subscriptionPlanDefinition } from './billing.constants';

interface PaymobIntentionResponse {
	id: string;
	client_secret: string;
}

export interface PaymobTransaction {
	amount_cents: number | string;
	created_at: string;
	currency: string;
	error_occured: boolean;
	has_parent_transaction: boolean;
	id: number | string;
	integration_id: number | string;
	is_3d_secure: boolean;
	is_auth: boolean;
	is_capture: boolean;
	is_refunded: boolean;
	is_standalone_payment: boolean;
	is_voided: boolean;
	order: { id: number | string; merchant_order_id: string };
	owner: number | string;
	pending: boolean;
	source_data: { pan: string; sub_type: string; type: string };
	success: boolean;
}

@Injectable()
export class PaymobService {
	constructor(private readonly configService: ConfigService) {}

	async createCheckout(
		attemptId: string,
		plan: subscriptionPlanDefinition,
		coach: {
			firstName: string;
			lastName: string;
			email: string;
			phone: string | null;
		},
	) {
		const config = this.configService.paymobConfig;
		const response = await fetch(`${config.baseUrl}/v1/intention/`, {
			method: 'POST',
			headers: {
				Authorization: `Token ${config.secretKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				amount: plan.priceCents,
				currency: plan.currency,
				payment_methods: [config.cardIntegrationId],
				items: [
					{
						name: `CoachHub ${plan.displayName}`,
						amount: plan.priceCents,
						description: `${plan.durationDays}-day CoachHub subscription`,
						quantity: 1,
					},
				],
				billing_data: {
					first_name: coach.firstName,
					last_name: coach.lastName,
					email: coach.email,
					// Paymob requires a phone. This fallback is sandbox-only for demo
					// coaches whose optional profile phone has not been filled in.
					phone_number: coach.phone || '+201000000000',
				},
				special_reference: attemptId,
				notification_url: config.notificationUrl,
				redirection_url: config.redirectionUrl,
			}),
			signal: AbortSignal.timeout(config.requestTimeoutMs),
		});

		if (!response.ok) {
			throw new BadGatewayException(
				`Paymob could not create a checkout (status ${response.status})`,
			);
		}

		const intention = (await response.json()) as PaymobIntentionResponse;
		if (!intention.id || !intention.client_secret) {
			throw new BadGatewayException('Paymob returned an incomplete checkout');
		}

		const checkoutUrl = new URL('/unifiedcheckout/', config.baseUrl);
		checkoutUrl.searchParams.set('publicKey', config.publicKey);
		checkoutUrl.searchParams.set('clientSecret', intention.client_secret);

		return { intentionId: String(intention.id), checkoutUrl: checkoutUrl.href };
	}

	verifyTransactionHmac(transaction: PaymobTransaction, receivedHmac: string) {
		const value = [
			transaction.amount_cents,
			transaction.created_at,
			transaction.currency,
			transaction.error_occured,
			transaction.has_parent_transaction,
			transaction.id,
			transaction.integration_id,
			transaction.is_3d_secure,
			transaction.is_auth,
			transaction.is_capture,
			transaction.is_refunded,
			transaction.is_standalone_payment,
			transaction.is_voided,
			transaction.order?.id,
			transaction.owner,
			transaction.pending,
			transaction.source_data?.pan,
			transaction.source_data?.sub_type,
			transaction.source_data?.type,
			transaction.success,
		]
			.map((part) => String(part ?? ''))
			.join('');

		const expectedHmac = createHmac(
			'sha512',
			this.configService.paymobConfig.hmacSecret,
		)
			.update(value)
			.digest('hex');
		const received = Buffer.from((receivedHmac || '').toLowerCase(), 'utf8');
		const expected = Buffer.from(expectedHmac, 'utf8');

		if (
			received.length !== expected.length ||
			!timingSafeEqual(received, expected)
		) {
			throw new UnauthorizedException('Invalid Paymob callback signature');
		}
	}

	isConfiguredCardIntegration(integrationId: number | string): boolean {
		return (
			Number(integrationId) ===
			this.configService.paymobConfig.cardIntegrationId
		);
	}
}
