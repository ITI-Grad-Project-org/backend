import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import {
	getScheduledDate,
	NutritionAdherenceOutcome,
	NutritionLogStatus,
	NutritionPlanStatus,
	NutritionPlanType,
} from '../../../common';
import { LoggedMeal } from '../entities/logged-meal.entity';
import { NutritionDayLog } from '../entities/nutrition-day-log.entity';
import { NutritionPlanDay } from '../entities/nutrition-plan-day.entity';
import { PlannedMeal } from '../entities/planned-meal.entity';
import { calculatePlannedMealTotals } from '../utils/nutrition-builder.utils';
import {
	assertNutritionLoggingWindow,
	assertNutritionLogIsWritable,
} from '../utils/nutrition-logging.utils';

/**
 * Returns the canonical writable log for a day, creating its stable Meal
 * prescription snapshots when logging starts for the first time.
 */
export async function getOrCreateWritableNutritionLog(
	manager: EntityManager,
	membership: ClientMembership,
	tenantId: string,
	dayId: string,
	now: Date,
) {
	const day = await lockOwnedNutritionDay(
		manager,
		tenantId,
		membership.id,
		dayId,
	);
	const plan = day.nutritionPlanWeek.nutritionPlan;
	const scheduledDate = getScheduledDate(
		plan.startDate as string,
		day.nutritionPlanWeek.weekNumber,
		day.dayNumber,
	);
	const existing = await loadOwnedNutritionLogByDay(
		manager,
		tenantId,
		membership.id,
		day.id,
	);
	if (existing) {
		assertNutritionLogIsWritable(existing, membership.tenant.timezone, now);
		return existing;
	}

	if (plan.status !== NutritionPlanStatus.PUBLISHED) {
		throw new ConflictException(
			'Cancelled nutrition plan days cannot start a new log',
		);
	}
	assertNutritionLoggingWindow(scheduledDate, membership.tenant.timezone, now);

	const meals = await manager.getRepository(PlannedMeal).find({
		where: {
			tenantId,
			nutritionPlanDayId: day.id,
		},
		relations: { foods: true },
		order: { position: 'ASC', foods: { position: 'ASC' } },
	});

	const logRepository = manager.getRepository(NutritionDayLog);
	const log = await logRepository.save(
		logRepository.create({
			tenantId,
			membershipId: membership.id,
			nutritionPlanId: plan.id,
			nutritionPlanDayId: day.id,
			scheduledDate,
			status: NutritionLogStatus.IN_PROGRESS,
			adherenceOutcome: null,
			waterMlConsumed: null,
			clientNotes: null,
			startedAt: now,
			completedAt: null,
		}),
	);
	const loggedMealRepository = manager.getRepository(LoggedMeal);
	if (meals.length > 0) {
		await loggedMealRepository.save(
			meals.map((meal) => {
				const totals = calculatePlannedMealTotals(meal.foods);
				return loggedMealRepository.create({
					nutritionDayLogId: log.id,
					plannedMealId: meal.id,
					sourceMealId: meal.sourceMealId,
					mealName: meal.mealName,
					slot: meal.slot,
					position: meal.position,
					prescribedCalories: totals.calories,
					prescribedProteinG: totals.proteinG,
					prescribedCarbsG: totals.carbsG,
					prescribedFatG: totals.fatG,
					prescribedFiberG: totals.fiberG,
					outcome: NutritionAdherenceOutcome.PENDING,
					clientNotes: null,
				});
			}),
		);
	}

	return loadOwnedNutritionLogOrFail(
		manager,
		tenantId,
		membership.id,
		log.id,
		'Created nutrition day log could not be loaded',
	);
}

export async function lockOwnedWritableNutritionLog(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
	logId: string,
	timezone: string,
	now: Date,
) {
	const log = await manager
		.getRepository(NutritionDayLog)
		.createQueryBuilder('log')
		.where('log.id = :logId', { logId })
		.andWhere('log.tenant_id = :tenantId', { tenantId })
		.andWhere('log.membership_id = :membershipId', { membershipId })
		.setLock('pessimistic_write')
		.getOne();
	if (!log) {
		throw new NotFoundException('Nutrition day log not found');
	}
	assertNutritionLogIsWritable(log, timezone, now);
	return log;
}

export function loadOwnedNutritionLog(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
	logId: string,
) {
	return manager.getRepository(NutritionDayLog).findOne({
		where: { id: logId, tenantId, membershipId },
		relations: {
			nutritionPlan: { tenant: true },
			meals: { plannedMeal: { foods: true } },
			foodLogs: true,
		},
		order: {
			meals: {
				position: 'ASC',
				plannedMeal: { foods: { position: 'ASC' } },
			},
			foodLogs: { loggedAt: 'ASC', createdAt: 'ASC', id: 'ASC' },
		},
	});
}

export async function loadOwnedNutritionLogOrFail(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
	logId: string,
	message = 'Nutrition day log could not be loaded',
) {
	const log = await loadOwnedNutritionLog(
		manager,
		tenantId,
		membershipId,
		logId,
	);
	if (!log) {
		throw new NotFoundException(message);
	}
	return log;
}

export async function touchNutritionLog(
	manager: EntityManager,
	log: NutritionDayLog,
	now: Date,
) {
	log.updatedAt = now;
	await manager.getRepository(NutritionDayLog).save(log);
}

async function lockOwnedNutritionDay(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
	dayId: string,
) {
	const day = await manager
		.getRepository(NutritionPlanDay)
		.createQueryBuilder('day')
		.innerJoinAndSelect('day.nutritionPlanWeek', 'week')
		.innerJoinAndSelect('week.nutritionPlan', 'plan')
		.innerJoinAndSelect('plan.tenant', 'tenant')
		.where('day.id = :dayId', { dayId })
		.andWhere('day.tenant_id = :tenantId', { tenantId })
		.andWhere('plan.tenant_id = :tenantId', { tenantId })
		.andWhere('plan.membership_id = :membershipId', { membershipId })
		.andWhere('plan.plan_type = :planType', {
			planType: NutritionPlanType.CLIENT,
		})
		.andWhere('plan.status IN (:...statuses)', {
			statuses: [NutritionPlanStatus.PUBLISHED, NutritionPlanStatus.CANCELLED],
		})
		.setLock('pessimistic_write')
		.getOne();
	if (!day) {
		throw new NotFoundException('Published nutrition plan day not found');
	}
	return day;
}

function loadOwnedNutritionLogByDay(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
	dayId: string,
) {
	return manager.getRepository(NutritionDayLog).findOne({
		where: {
			tenantId,
			membershipId,
			nutritionPlanDayId: dayId,
		},
		relations: {
			nutritionPlan: { tenant: true },
			meals: { plannedMeal: { foods: true } },
			foodLogs: true,
		},
		order: {
			meals: {
				position: 'ASC',
				plannedMeal: { foods: { position: 'ASC' } },
			},
			foodLogs: { loggedAt: 'ASC', createdAt: 'ASC', id: 'ASC' },
		},
	});
}
