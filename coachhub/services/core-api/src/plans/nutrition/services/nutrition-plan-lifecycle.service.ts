import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import {
	deriveInclusiveEndDate,
	getDateOnlyInTimeZone,
	MembershipStatus,
	NutritionPlanStatus,
	NutritionPlanType,
} from '../../../common';
import { RescheduleClientNutritionPlanDto } from '../dto/nutrition-plan-lifecycle.dto';
import { NutritionPlanWeek } from '../entities/nutrition-plan-week.entity';
import { NutritionPlan } from '../entities/nutrition-plan.entity';
import {
	assertNutritionStartDate,
	assertNutritionTenant,
} from '../utils/client-nutrition-plan.utils';
import {
	assertNutritionPlanCanBeCancelled,
	assertNutritionPlanStartDateIsPublishable,
	NutritionVarianceWarning,
	validateNutritionPlanForPublishing,
} from '../utils/nutrition-lifecycle.utils';
import { ClientNutritionPlansService } from './client-nutrition-plans.service';

@Injectable()
export class NutritionPlanLifecycleService {
	constructor(
		private readonly dataSource: DataSource,
		private readonly clientNutritionPlansService: ClientNutritionPlansService,
	) {}

	async publishClientPlan(tenantId: string | null, planId: string) {
		const activeTenantId = assertNutritionTenant(tenantId);
		let varianceWarnings: NutritionVarianceWarning[] = [];

		await this.dataSource.transaction(async (manager) => {
			const plan = await lockClientNutritionPlan(
				manager,
				activeTenantId,
				planId,
			);
			if (plan.status !== NutritionPlanStatus.DRAFT) {
				throw new ConflictException(
					'Only draft client nutrition plans can be published',
				);
			}

			assertNutritionPlanStartDateIsPublishable(
				plan.startDate as string,
				plan.tenant.timezone,
			);
			await lockActiveMembership(
				manager,
				activeTenantId,
				plan.membershipId as string,
			);
			const weeks = await loadNutritionPlanTree(manager, plan);
			varianceWarnings = validateNutritionPlanForPublishing(plan, weeks);
			await assertNoPublishedNutritionOverlap(manager, plan);

			plan.status = NutritionPlanStatus.PUBLISHED;
			await manager.getRepository(NutritionPlan).save(plan);
		});

		return {
			plan: await this.clientNutritionPlansService.getClientPlan(
				activeTenantId,
				planId,
			),
			varianceWarnings,
		};
	}

	async rescheduleClientPlan(
		tenantId: string | null,
		planId: string,
		body: RescheduleClientNutritionPlanDto,
	) {
		const activeTenantId = assertNutritionTenant(tenantId);
		await this.dataSource.transaction(async (manager) => {
			const plan = await lockClientNutritionPlan(
				manager,
				activeTenantId,
				planId,
			);
			if (plan.status !== NutritionPlanStatus.PUBLISHED) {
				throw new ConflictException(
					'Only published client nutrition plans can be rescheduled',
				);
			}

			const today = getDateOnlyInTimeZone(new Date(), plan.tenant.timezone);
			if ((plan.startDate as string) <= today) {
				throw new ConflictException(
					'Active or ended client nutrition plans cannot be rescheduled',
				);
			}
			assertNutritionStartDate(body.startDate, plan.tenant.timezone);

			await lockActiveMembership(
				manager,
				activeTenantId,
				plan.membershipId as string,
			);
			plan.startDate = body.startDate;
			plan.endDate = deriveInclusiveEndDate(body.startDate, plan.durationWeeks);
			await assertNoPublishedNutritionOverlap(manager, plan);
			await manager.getRepository(NutritionPlan).save(plan);
		});

		return this.clientNutritionPlansService.getClientPlan(
			activeTenantId,
			planId,
		);
	}

	async cancelClientPlan(tenantId: string | null, planId: string) {
		const activeTenantId = assertNutritionTenant(tenantId);
		await this.dataSource.transaction(async (manager) => {
			const plan = await lockClientNutritionPlan(
				manager,
				activeTenantId,
				planId,
			);
			assertNutritionPlanCanBeCancelled(plan, plan.tenant.timezone);

			plan.status = NutritionPlanStatus.CANCELLED;
			await manager.getRepository(NutritionPlan).save(plan);
		});

		return this.clientNutritionPlansService.getClientPlan(
			activeTenantId,
			planId,
		);
	}

	async archiveClientPlan(tenantId: string | null, planId: string) {
		const activeTenantId = assertNutritionTenant(tenantId);
		await this.dataSource.transaction(async (manager) => {
			const plan = await lockClientNutritionPlan(
				manager,
				activeTenantId,
				planId,
			);
			plan.isArchived = true;
			await manager.getRepository(NutritionPlan).save(plan);
		});

		return { message: 'Client nutrition plan archived' };
	}

	async unarchiveClientPlan(tenantId: string | null, planId: string) {
		const activeTenantId = assertNutritionTenant(tenantId);
		await this.dataSource.transaction(async (manager) => {
			const plan = await lockClientNutritionPlan(
				manager,
				activeTenantId,
				planId,
			);
			plan.isArchived = false;
			await manager.getRepository(NutritionPlan).save(plan);
		});

		return { message: 'Client nutrition plan unarchived' };
	}
}

/** Locks one tenant-owned client plan for a lifecycle transition. */
async function lockClientNutritionPlan(
	manager: EntityManager,
	tenantId: string,
	planId: string,
) {
	const plan = await manager
		.getRepository(NutritionPlan)
		.createQueryBuilder('plan')
		.innerJoinAndSelect('plan.tenant', 'tenant')
		.where('plan.id = :planId', { planId })
		.andWhere('plan.tenant_id = :tenantId', { tenantId })
		.andWhere('plan.plan_type = :planType', {
			planType: NutritionPlanType.CLIENT,
		})
		.setLock('pessimistic_write')
		.getOne();
	if (!plan) {
		throw new NotFoundException('Client nutrition plan not found');
	}
	return plan;
}

/**
 * Locks the shared owning membership so concurrent publication/rescheduling of
 * different plans for the same client cannot both pass the overlap query.
 */
async function lockActiveMembership(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
) {
	const membership = await manager
		.getRepository(ClientMembership)
		.createQueryBuilder('membership')
		.innerJoin('membership.tenant', 'tenant')
		.innerJoin('membership.client', 'client')
		.where('membership.id = :membershipId', { membershipId })
		.andWhere('tenant.id = :tenantId', { tenantId })
		.andWhere('membership.status = :status', {
			status: MembershipStatus.ACTIVE,
		})
		.setLock('pessimistic_write')
		.getOne();
	if (!membership) {
		throw new NotFoundException('Active client membership not found');
	}
	return membership;
}

/** Loads the complete immutable prescription tree used by publish validation. */
async function loadNutritionPlanTree(
	manager: EntityManager,
	plan: NutritionPlan,
) {
	return manager.getRepository(NutritionPlanWeek).find({
		where: {
			nutritionPlanId: plan.id,
			tenantId: plan.tenantId,
		},
		relations: { days: { meals: { foods: true } } },
		order: {
			weekNumber: 'ASC',
			days: {
				dayNumber: 'ASC',
				meals: { position: 'ASC', foods: { position: 'ASC' } },
			},
		},
	});
}

/** Uses inclusive comparisons, so adjacent non-overlapping ranges are valid. */
async function assertNoPublishedNutritionOverlap(
	manager: EntityManager,
	plan: NutritionPlan,
) {
	const overlap = await manager
		.getRepository(NutritionPlan)
		.createQueryBuilder('overlap')
		.where('overlap.tenant_id = :tenantId', { tenantId: plan.tenantId })
		.andWhere('overlap.membership_id = :membershipId', {
			membershipId: plan.membershipId,
		})
		.andWhere('overlap.plan_type = :planType', {
			planType: NutritionPlanType.CLIENT,
		})
		.andWhere('overlap.status = :status', {
			status: NutritionPlanStatus.PUBLISHED,
		})
		// what does this : "<>" mean here
		.andWhere('overlap.id <> :planId', { planId: plan.id })
		.andWhere('overlap.start_date <= :endDate', {
			endDate: plan.endDate,
		})
		.andWhere('overlap.end_date >= :startDate', {
			startDate: plan.startDate,
		})
		.getOne();
	if (overlap) {
		throw new ConflictException(
			'Published client nutrition plan dates overlap another plan for this membership',
		);
	}
}
