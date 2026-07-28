import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NutritionPlanType } from '../../../common';
import { FoodLog } from '../entities/food-log.entity';
import { NutritionDayLog } from '../entities/nutrition-day-log.entity';
import { NutritionPlanDay } from '../entities/nutrition-plan-day.entity';
import { NutritionPlan } from '../entities/nutrition-plan.entity';
import {
	assertNutritionTenant,
	deriveNutritionPlanSchedulePhase,
	mapClientNutritionDay,
	mapEffectiveDayTargets,
} from '../utils/client-nutrition-plan.utils';
import {
	calculateActualNutritionTotals,
	mapActualFoodLogResponse,
	mapActualNutritionComparison,
} from '../utils/nutrition-food-log.utils';
import { mapNutritionDayLogState } from '../utils/nutrition-log-state.utils';

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

function mapReviewPlan(plan: NutritionPlan, now: Date) {
	return {
		id: plan.id,
		membershipId: plan.membershipId,
		membership: plan.membership
			? {
					id: plan.membership.id,
					status: plan.membership.status,
					client: plan.membership.client
						? {
								id: plan.membership.client.id,
								firstName: plan.membership.client.firstName,
								lastName: plan.membership.client.lastName,
								email: plan.membership.client.email,
								avatarUrl: plan.membership.client.avatarUrl,
							}
						: null,
				}
			: null,
		name: plan.name,
		description: plan.description,
		goal: plan.goal,
		startDate: plan.startDate,
		endDate: plan.endDate,
		status: plan.status,
		schedulePhase: deriveNutritionPlanSchedulePhase(
			plan,
			plan.tenant.timezone,
			now,
		),
		isArchived: plan.isArchived,
	};
}

function mapReviewLogSummary(
	log: NutritionDayLog,
	plan: NutritionPlan,
	now: Date,
) {
	const prescribedTotals = calculateLoggedMealPrescriptionTotals(log);
	const actualTotals = calculateActualNutritionTotals(log.foodLogs ?? []);
	const effectiveTargets = mapEffectiveDayTargets(plan, log.nutritionPlanDay);
	const state = mapNutritionDayLogState(
		log,
		log.scheduledDate,
		plan.tenant.timezone,
		now,
	);

	return {
		id: log.id,
		nutritionPlanDayId: log.nutritionPlanDayId,
		scheduledDate: log.scheduledDate,
		status: log.status,
		logState: state.logState,
		adherenceOutcome: log.adherenceOutcome,
		effectiveTargets,
		prescribedTotals,
		actualTotals,
		actualFoodCount: (log.foodLogs ?? []).length,
		comparisons: mapActualNutritionComparison(
			effectiveTargets,
			prescribedTotals,
			actualTotals,
		),
		mealOutcomes: [...(log.meals ?? [])]
			.sort((left, right) => left.position - right.position)
			.map((meal) => ({
				loggedMealId: meal.id,
				plannedMealId: meal.plannedMealId,
				mealName: meal.mealName,
				outcome: meal.outcome,
			})),
		waterMlConsumed: log.waterMlConsumed,
		clientNotes: log.clientNotes,
		isRetrospective: state.isRetrospective,
		startedAt: log.startedAt,
		completedAt: log.completedAt,
		updatedAt: log.updatedAt,
	};
}

function mapReportedAdherence(
	log: NutritionDayLog,
	timezone: string,
	now: Date,
) {
	const state = mapNutritionDayLogState(log, log.scheduledDate, timezone, now);
	return {
		logId: log.id,
		status: log.status,
		logState: state.logState,
		adherenceOutcome: log.adherenceOutcome,
		waterMlConsumed: log.waterMlConsumed,
		clientNotes: log.clientNotes,
		meals: [...(log.meals ?? [])]
			.sort((left, right) => left.position - right.position)
			.map((meal) => ({
				loggedMealId: meal.id,
				plannedMealId: meal.plannedMealId,
				mealName: meal.mealName,
				slot: meal.slot,
				position: meal.position,
				outcome: meal.outcome,
				clientNotes: meal.clientNotes,
			})),
		startedAt: log.startedAt,
		completedAt: log.completedAt,
		updatedAt: log.updatedAt,
		isRetrospective: state.isRetrospective,
	};
}

function mapActualIntake(log: NutritionDayLog) {
	const foodLogs = [...(log.foodLogs ?? [])].sort(compareActualFoodLogs);
	const meals = [...(log.meals ?? [])]
		.sort((left, right) => left.position - right.position)
		.map((meal) => {
			const linkedFoods = foodLogs.filter(
				(foodLog) => foodLog.loggedMealId === meal.id,
			);
			return {
				loggedMealId: meal.id,
				plannedMealId: meal.plannedMealId,
				mealName: meal.mealName,
				slot: meal.slot,
				actualTotals: calculateActualNutritionTotals(linkedFoods),
				foods: linkedFoods.map(mapActualFoodLogResponse),
			};
		});

	return {
		actualTotals: calculateActualNutritionTotals(foodLogs),
		meals,
		unplannedFoods: foodLogs
			.filter((foodLog) => foodLog.loggedMealId === null)
			.map(mapActualFoodLogResponse),
	};
}

function calculateLoggedMealPrescriptionTotals(log: NutritionDayLog) {
	const totals = {
		calories: 0,
		proteinG: 0,
		carbsG: 0,
		fatG: 0,
		fiberG: 0 as number | null,
	};
	for (const meal of log.meals ?? []) {
		totals.calories += meal.prescribedCalories;
		totals.proteinG += meal.prescribedProteinG;
		totals.carbsG += meal.prescribedCarbsG;
		totals.fatG += meal.prescribedFatG;
		if (totals.fiberG !== null) {
			totals.fiberG =
				meal.prescribedFiberG === null
					? null
					: totals.fiberG + meal.prescribedFiberG;
		}
	}
	return {
		calories: roundNutrient(totals.calories),
		proteinG: roundNutrient(totals.proteinG),
		carbsG: roundNutrient(totals.carbsG),
		fatG: roundNutrient(totals.fatG),
		fiberG: totals.fiberG === null ? null : roundNutrient(totals.fiberG),
	};
}

function compareActualFoodLogs(left: FoodLog, right: FoodLog) {
	const loggedAtDifference =
		new Date(left.loggedAt).getTime() - new Date(right.loggedAt).getTime();
	if (loggedAtDifference !== 0) return loggedAtDifference;

	const createdAtDifference =
		new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
	if (createdAtDifference !== 0) return createdAtDifference;
	return left.id.localeCompare(right.id);
}

function roundNutrient(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}
