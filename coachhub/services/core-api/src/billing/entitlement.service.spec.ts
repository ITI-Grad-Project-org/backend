import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { MembershipStatus } from '../common';
import { Tenant } from '../tenant/entities/tenant.entity';
import { EntitlementService } from './entitlement.service';
import { SubscriptionPlan } from './enums/subscription-plan.enum';

describe('EntitlementService', () => {
	let tenantRepository: { findOne: jest.Mock };
	let membershipRepository: { count: jest.Mock };
	let service: EntitlementService;

	beforeEach(() => {
		tenantRepository = {
			findOne: jest.fn().mockResolvedValue({
				id: 'tenant-1',
				subscriptionPlan: SubscriptionPlan.FREE,
				subscriptionExpiresAt: null,
			}),
		};
		membershipRepository = { count: jest.fn().mockResolvedValue(0) };
		service = new EntitlementService(
			tenantRepository as unknown as Repository<Tenant>,
			membershipRepository as unknown as Repository<ClientMembership>,
		);
	});

	it('counts only active clients inside the tenant', async () => {
		await service.getBillingSummary('tenant-1');

		expect(membershipRepository.count).toHaveBeenCalledWith({
			where: {
				tenant: { id: 'tenant-1' },
				status: MembershipStatus.ACTIVE,
			},
		});
	});

	it('blocks a fourth active client on Free', async () => {
		membershipRepository.count.mockResolvedValue(3);

		await expect(
			service.assertCanAddActiveClient('tenant-1'),
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('allows unlimited active clients on an active Studio subscription', async () => {
		tenantRepository.findOne.mockResolvedValue({
			id: 'tenant-1',
			subscriptionPlan: SubscriptionPlan.STUDIO,
			subscriptionExpiresAt: new Date(Date.now() + 60_000),
		});

		await service.assertCanAddActiveClient('tenant-1');

		expect(membershipRepository.count).not.toHaveBeenCalled();
	});

	it('treats an expired paid subscription as Free', async () => {
		tenantRepository.findOne.mockResolvedValue({
			id: 'tenant-1',
			subscriptionPlan: SubscriptionPlan.SOLO,
			subscriptionExpiresAt: new Date(Date.now() - 60_000),
		});

		await expect(
			service.assertCanGenerateAiPlan('tenant-1'),
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('allows AI generation on an active Solo subscription', async () => {
		tenantRepository.findOne.mockResolvedValue({
			id: 'tenant-1',
			subscriptionPlan: SubscriptionPlan.SOLO,
			subscriptionExpiresAt: new Date(Date.now() + 60_000),
		});

		await expect(
			service.assertCanGenerateAiPlan('tenant-1'),
		).resolves.toBeUndefined();
	});
});
