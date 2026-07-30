import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import {
	MembershipStatus,
	NutritionPlanStatus,
	NutritionPlanType,
} from '../../../common';
import { NutritionPlanWeek } from '../entities/nutrition-plan-week.entity';
import { NutritionPlan } from '../entities/nutrition-plan.entity';

/** Locks one tenant-owned client plan for a lifecycle transition. */
export async function lockClientNutritionPlan(
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
 * Locks the owning membership so concurrent lifecycle operations on different
 * plans for the same client cannot both pass the overlap query.
 */
export async function lockActiveNutritionMembership(
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

/** Loads the complete prescription tree used by publish validation. */
export function loadNutritionPlanTree(
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

/** Rejects inclusive date overlap; adjacent non-overlapping ranges are valid. */
export async function assertNoPublishedNutritionOverlap(
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
