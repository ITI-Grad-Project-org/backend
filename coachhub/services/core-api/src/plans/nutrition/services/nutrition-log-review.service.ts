import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NutritionPlanType } from '../../../common';
import { NutritionDayLog } from '../entities/nutrition-day-log.entity';
import { NutritionPlanDay } from '../entities/nutrition-plan-day.entity';
import { NutritionPlan } from '../entities/nutrition-plan.entity';
import {
	mapActualIntake,
	mapReportedAdherence,
	mapReviewLogSummary,
	mapReviewPlan,
} from '../mappers/nutrition-log-review.mapper';
import { mapClientNutritionDay } from '../mappers/client-nutrition-plan.mapper';
import { assertNutritionTenant } from '../utils/client-nutrition-plan.utils';
import {
	calculateActualNutritionTotals,
	mapActualNutritionComparison,
} from '../utils/nutrition-food-log.utils';

@Injectable()
export class NutritionLogReviewService {
	constructor(
		@InjectRepository(NutritionPlan)
		private readonly nutritionPlanRepository: Repository<NutritionPlan>,
		@InjectRepository(NutritionPlanDay)
		private readonly nutritionPlanDayRepository: Repository<NutritionPlanDay>,
		@InjectRepository(NutritionDayLog)
		private readonly nutritionDayLogRepository: Repository<NutritionDayLog>,
	) {}

	async listPlanLogs(
		tenantId: string | null,
		planId: string,
		now = new Date(),
	) {
		const activeTenantId = assertNutritionTenant(tenantId);
		const plan = await this.getClientPlan(activeTenantId, planId);
		const logs = await this.nutritionDayLogRepository.find({
			where: {
				tenantId: activeTenantId,
				nutritionPlanId: plan.id,
				membershipId: plan.membershipId as string,
			},
			relations: {
				nutritionPlanDay: true,
				meals: true,
				foodLogs: true,
			},
			order: {
				scheduledDate: 'DESC',
				startedAt: 'DESC',
				meals: { position: 'ASC' },
				foodLogs: { loggedAt: 'ASC', createdAt: 'ASC', id: 'ASC' },
			},
		});

		return {
			plan: mapReviewPlan(plan, now),
			logs: logs.map((log) => mapReviewLogSummary(log, plan, now)),
		};
	}

	async getPlanDayLog(
		tenantId: string | null,
		planId: string,
		dayId: string,
		now = new Date(),
	) {
		const activeTenantId = assertNutritionTenant(tenantId);
		const day = await this.nutritionPlanDayRepository.findOne({
			where: {
				id: dayId,
				tenantId: activeTenantId,
				nutritionPlanWeek: {
					nutritionPlan: {
						id: planId,
						tenantId: activeTenantId,
						planType: NutritionPlanType.CLIENT,
					},
				},
			},
			relations: {
				nutritionPlanWeek: {
					nutritionPlan: {
						tenant: true,
						membership: { client: true },
					},
				},
				meals: { foods: true },
			},
			order: {
				meals: {
					position: 'ASC',
					foods: { position: 'ASC' },
				},
			},
		});
		if (!day) {
			throw new NotFoundException('Client nutrition plan day not found');
		}

		const plan = day.nutritionPlanWeek.nutritionPlan;
		const log = await this.nutritionDayLogRepository.findOne({
			where: {
				tenantId: activeTenantId,
				membershipId: plan.membershipId as string,
				nutritionPlanId: plan.id,
				nutritionPlanDayId: day.id,
			},
			relations: {
				meals: true,
				foodLogs: true,
			},
			order: {
				meals: { position: 'ASC' },
				foodLogs: { loggedAt: 'ASC', createdAt: 'ASC', id: 'ASC' },
			},
		});
		const prescription = mapClientNutritionDay(
			plan,
			day.nutritionPlanWeek.weekNumber,
			day,
		);

		return {
			plan: mapReviewPlan(plan, now),
			scheduledDate: prescription.scheduledDate,
			prescription,
			reportedAdherence: log
				? mapReportedAdherence(log, plan.tenant.timezone, now)
				: null,
			actualIntake: log ? mapActualIntake(log) : null,
			comparisons: log
				? mapActualNutritionComparison(
						prescription.effectiveTargets,
						prescription.prescribedTotals,
						calculateActualNutritionTotals(log.foodLogs ?? []),
					)
				: null,
		};
	}

	private async getClientPlan(tenantId: string, planId: string) {
		const plan = await this.nutritionPlanRepository.findOne({
			where: {
				id: planId,
				tenantId,
				planType: NutritionPlanType.CLIENT,
			},
			relations: {
				tenant: true,
				membership: { client: true },
			},
		});
		if (!plan) {
			throw new NotFoundException('Client nutrition plan not found');
		}
		return plan;
	}
}
