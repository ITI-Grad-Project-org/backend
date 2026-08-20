import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { MembershipStatus } from '../common';
import { Tenant } from '../tenant/entities/tenant.entity';
import { PLAN_DEFINITIONS } from './billing.constants';
import { SubscriptionPlan } from './enums/subscription-plan.enum';

@Injectable()
export class EntitlementService {
	constructor(
		@InjectRepository(Tenant)
		private readonly tenantRepository: Repository<Tenant>,
		@InjectRepository(ClientMembership)
		private readonly membershipRepository: Repository<ClientMembership>,
	) {}

	async getBillingSummary(tenantId: string) {
		const tenant = await this.findTenant(tenantId);
		const effectivePlan = this.getEffectivePlan(tenant);
		const plan = PLAN_DEFINITIONS[effectivePlan];
		const activeClientCount = await this.countActiveClients(tenantId);

		return {
			plan: effectivePlan,
			storedPlan: tenant.subscriptionPlan,
			subscriptionExpiresAt: tenant.subscriptionExpiresAt,
			isPaidSubscriptionActive: effectivePlan !== SubscriptionPlan.FREE,
			activeClientCount,
			activeClientLimit: plan.activeClientLimit,
			canAddActiveClient:
				plan.activeClientLimit === null ||
				activeClientCount < plan.activeClientLimit,
			aiPlanBuilderEnabled: plan.aiPlanBuilderEnabled,
		};
	}

	async assertCanAddActiveClient(tenantId: string): Promise<void> {
		const tenant = await this.findTenant(tenantId);
		const plan = PLAN_DEFINITIONS[this.getEffectivePlan(tenant)];
		if (plan.activeClientLimit === null) {
			return;
		}

		const activeClientCount = await this.countActiveClients(tenantId);
		if (activeClientCount >= plan.activeClientLimit) {
			throw new ForbiddenException(
				`Your ${plan.displayName} plan allows ${plan.activeClientLimit} active clients. Upgrade your subscription to add another client.`,
			);
		}
	}

	async assertCanGenerateAiPlan(tenantId: string): Promise<void> {
		const tenant = await this.findTenant(tenantId);
		const plan = PLAN_DEFINITIONS[this.getEffectivePlan(tenant)];
		if (!plan.aiPlanBuilderEnabled) {
			throw new ForbiddenException(
				'The AI plan builder requires an active Solo or Studio subscription.',
			);
		}
	}

	getEffectivePlan(tenant: Tenant, now = new Date()): SubscriptionPlan {
		if (
			tenant.subscriptionPlan !== SubscriptionPlan.FREE &&
			tenant.subscriptionExpiresAt &&
			tenant.subscriptionExpiresAt.getTime() > now.getTime()
		) {
			return tenant.subscriptionPlan;
		}
		return SubscriptionPlan.FREE;
	}

	private countActiveClients(tenantId: string): Promise<number> {
		return this.membershipRepository.count({
			where: {
				tenant: { id: tenantId },
				status: MembershipStatus.ACTIVE,
			},
		});
	}

	private async findTenant(tenantId: string): Promise<Tenant> {
		const tenant = await this.tenantRepository.findOne({
			where: { id: tenantId },
		});
		if (!tenant) {
			throw new NotFoundException('Tenant not found');
		}
		return tenant;
	}
}
