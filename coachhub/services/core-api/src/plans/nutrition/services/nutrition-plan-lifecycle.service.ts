import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PlanBuilderCacheService } from '../../../cache/plan-builder-cache.service';
import {
	deriveInclusiveEndDate,
	getDateOnlyInTimeZone,
	NutritionPlanStatus,
} from '../../../common';
import { RescheduleClientNutritionPlanDto } from '../dto/nutrition-plan-lifecycle.dto';
import { NutritionPlan } from '../entities/nutrition-plan.entity';
import {
	assertNoPublishedNutritionOverlap,
	loadNutritionPlanTree,
	lockActiveNutritionMembership,
	lockClientNutritionPlan,
} from '../persistence/nutrition-plan-lifecycle.persistence';
import {
	assertNutritionStartDate,
	assertNutritionTenant,
} from '../utils/client-nutrition-plan.utils';
import {
	assertNutritionPlanCanBeCancelled,
	assertNutritionPlanStartDateIsPublishable,
} from '../utils/nutrition-lifecycle.utils';
import {
	NutritionVarianceWarning,
	validateNutritionPlanForPublishing,
} from '../utils/nutrition-publish-validation.utils';
import { ClientNutritionPlansService } from './client-nutrition-plans.service';

@Injectable()
export class NutritionPlanLifecycleService {
	constructor(
		private readonly dataSource: DataSource,
		private readonly clientNutritionPlansService: ClientNutritionPlansService,
		private readonly planBuilderCache: PlanBuilderCacheService,
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
			await lockActiveNutritionMembership(
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
		await this.planBuilderCache.invalidateBuilder(
			'nutrition',
			activeTenantId,
			planId,
		);

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

			await lockActiveNutritionMembership(
				manager,
				activeTenantId,
				plan.membershipId as string,
			);
			plan.startDate = body.startDate;
			plan.endDate = deriveInclusiveEndDate(body.startDate, plan.durationWeeks);
			await assertNoPublishedNutritionOverlap(manager, plan);
			await manager.getRepository(NutritionPlan).save(plan);
		});
		await this.planBuilderCache.invalidateBuilder(
			'nutrition',
			activeTenantId,
			planId,
		);

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
		await this.planBuilderCache.invalidateBuilder(
			'nutrition',
			activeTenantId,
			planId,
		);

		return this.clientNutritionPlansService.getClientPlan(
			activeTenantId,
			planId,
		);
	}

	async archiveClientPlan(tenantId: string | null, planId: string) {
		const activeTenantId = assertNutritionTenant(tenantId);
		await this.setArchived(activeTenantId, planId, true);
		await this.planBuilderCache.invalidateBuilder(
			'nutrition',
			activeTenantId,
			planId,
		);
		return { message: 'Client nutrition plan archived' };
	}

	async unarchiveClientPlan(tenantId: string | null, planId: string) {
		const activeTenantId = assertNutritionTenant(tenantId);
		await this.setArchived(activeTenantId, planId, false);
		await this.planBuilderCache.invalidateBuilder(
			'nutrition',
			activeTenantId,
			planId,
		);
		return { message: 'Client nutrition plan unarchived' };
	}

	private async setArchived(
		tenantId: string,
		planId: string,
		isArchived: boolean,
	) {
		await this.dataSource.transaction(async (manager) => {
			const plan = await lockClientNutritionPlan(manager, tenantId, planId);
			plan.isArchived = isArchived;
			await manager.getRepository(NutritionPlan).save(plan);
		});
	}
}
