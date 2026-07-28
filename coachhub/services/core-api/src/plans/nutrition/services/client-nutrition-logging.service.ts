import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import {
	getDateOnlyInTimeZone,
	getScheduledDate,
	MembershipStatus,
	NutritionAdherenceOutcome,
	NutritionLogStatus,
	NutritionPlanStatus,
	NutritionPlanType,
	ServingUnit,
} from '../../../common';
import {
	CreateActualFoodLogDto,
	UpdateActualFoodLogDto,
	UpdateLoggedMealOutcomeDto,
	UpdateNutritionDayLogDto,
} from '../dto/nutrition-logging.dto';
import { FoodLog } from '../entities/food-log.entity';
import { Food } from '../entities/food.entity';
import { LoggedMeal } from '../entities/logged-meal.entity';
import { NutritionDayLog } from '../entities/nutrition-day-log.entity';
import { NutritionPlanDay } from '../entities/nutrition-plan-day.entity';
import { PlannedMeal } from '../entities/planned-meal.entity';
import { assertNutritionTenant } from '../utils/client-nutrition-plan.utils';
import {
	calculatePlannedMealTotals,
	mapPlannedMealResponse,
} from '../utils/nutrition-builder.utils';
import {
	normalizeFoodDisplayText,
	normalizeNullableFoodDisplayText,
} from '../utils/food-library.utils';
import {
	calculateActualNutritionTotals,
	calculateLibraryFoodLogSnapshot,
	mapActualFoodLogResponse,
	recalculateLibraryFoodLogAmount,
} from '../utils/nutrition-food-log.utils';
import {
	assertRealisticActualFoodAmount,
	assertRealisticActualFoodNutrients,
	assertRealisticFoodReferenceAmount,
} from '../utils/nutrition-validation.utils';
import {
	deriveNutritionAdherenceOutcome,
	isNutritionLogPastDeadline,
	isNutritionLogWindowOpen,
	mapNutritionDayLogState,
} from '../utils/nutrition-log-state.utils';

@Injectable()
export class ClientNutritionLoggingService {
	constructor(private readonly dataSource: DataSource) {}

	async startOrResumeLog(
		clientId: string,
		tenantId: string | null,
		dayId: string,
		now = new Date(),
	) {
		const activeTenantId = assertNutritionTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const membership = await getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const log = await getOrCreateWritableLog(
				manager,
				membership,
				activeTenantId,
				dayId,
				now,
			);
			return mapNutritionLogResponse(log, membership.tenant.timezone, now);
		});
	}

	async getLog(
		clientId: string,
		tenantId: string | null,
		logId: string,
		now = new Date(),
	) {
		const activeTenantId = assertNutritionTenant(tenantId);
		const manager = this.dataSource.manager;
		const membership = await getActiveMembership(
			manager,
			clientId,
			activeTenantId,
		);
		const log = await loadOwnedNutritionLog(
			manager,
			activeTenantId,
			membership.id,
			logId,
		);
		if (!log) {
			throw new NotFoundException('Nutrition day log not found');
		}

		return mapNutritionLogResponse(log, membership.tenant.timezone, now);
	}

	async updateLog(
		clientId: string,
		tenantId: string | null,
		logId: string,
		body: UpdateNutritionDayLogDto,
		now = new Date(),
	) {
		if (body.waterMlConsumed === undefined && body.clientNotes === undefined) {
			throw new BadRequestException(
				'Provide waterMlConsumed or clientNotes to update the log',
			);
		}
		const activeTenantId = assertNutritionTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const membership = await getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const log = await lockOwnedWritableLog(
				manager,
				activeTenantId,
				membership.id,
				logId,
				membership.tenant.timezone,
				now,
			);

			if (body.waterMlConsumed !== undefined) {
				log.waterMlConsumed = body.waterMlConsumed;
			}
			if (body.clientNotes !== undefined) {
				log.clientNotes = normalizeClientNotes(body.clientNotes);
			}
			log.updatedAt = now;
			await manager.getRepository(NutritionDayLog).save(log);

			return mapReloadedNutritionLog(
				manager,
				activeTenantId,
				membership,
				log.id,
				now,
			);
		});
	}

	async updateMealOutcome(
		clientId: string,
		tenantId: string | null,
		logId: string,
		loggedMealId: string,
		body: UpdateLoggedMealOutcomeDto,
		now = new Date(),
	) {
		if (body.outcome === NutritionAdherenceOutcome.PENDING) {
			throw new BadRequestException(
				'pending cannot be submitted as a Meal outcome',
			);
		}
		const activeTenantId = assertNutritionTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const membership = await getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const log = await lockOwnedWritableLog(
				manager,
				activeTenantId,
				membership.id,
				logId,
				membership.tenant.timezone,
				now,
			);
			const repository = manager.getRepository(LoggedMeal);
			const loggedMeal = await repository.findOne({
				where: {
					id: loggedMealId,
					nutritionDayLogId: log.id,
				},
			});
			if (!loggedMeal) {
				throw new NotFoundException('Logged Meal not found');
			}

			loggedMeal.outcome = body.outcome;
			if (body.clientNotes !== undefined) {
				loggedMeal.clientNotes = normalizeClientNotes(body.clientNotes);
			}
			await repository.save(loggedMeal);
			log.updatedAt = now;
			await manager.getRepository(NutritionDayLog).save(log);

			return mapReloadedNutritionLog(
				manager,
				activeTenantId,
				membership,
				log.id,
				now,
			);
		});
	}

	async createActualFood(
		clientId: string,
		tenantId: string | null,
		logId: string,
		body: CreateActualFoodLogDto,
		now = new Date(),
	) {
		const activeTenantId = assertNutritionTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const membership = await getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const log = await lockOwnedWritableLog(
				manager,
				activeTenantId,
				membership.id,
				logId,
				membership.tenant.timezone,
				now,
			);
			await assertLoggedMealBelongsToLog(
				manager,
				log.id,
				body.loggedMealId ?? null,
			);

			const repository = manager.getRepository(FoodLog);
			const foodLog = repository.create({
				tenantId: activeTenantId,
				membershipId: membership.id,
				nutritionDayLogId: log.id,
				loggedMealId: body.loggedMealId ?? null,
				foodId: null,
				mealSlot: body.mealSlot,
				foodName: '',
				brand: null,
				servingSize: null,
				servingUnit: null,
				amount: null,
				calories: null,
				proteinG: null,
				carbsG: null,
				fatG: null,
				fiberG: null,
				clientNotes: normalizeClientNotes(body.clientNotes ?? null),
				loggedAt: now,
			});
			await applyActualFoodDefinition(manager, foodLog, activeTenantId, body);
			await repository.save(foodLog);
			await touchNutritionLog(manager, log, now);

			return mapReloadedNutritionLog(
				manager,
				activeTenantId,
				membership,
				log.id,
				now,
			);
		});
	}

	async updateActualFood(
		clientId: string,
		tenantId: string | null,
		logId: string,
		foodLogId: string,
		body: UpdateActualFoodLogDto,
		now = new Date(),
	) {
		if (Object.keys(body).length === 0) {
			throw new BadRequestException(
				'Provide at least one actual Food field to update',
			);
		}
		const activeTenantId = assertNutritionTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const membership = await getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const log = await lockOwnedWritableLog(
				manager,
				activeTenantId,
				membership.id,
				logId,
				membership.tenant.timezone,
				now,
			);
			const repository = manager.getRepository(FoodLog);
			const foodLog = await repository.findOne({
				where: {
					id: foodLogId,
					tenantId: activeTenantId,
					membershipId: membership.id,
					nutritionDayLogId: log.id,
				},
			});
			if (!foodLog) {
				throw new NotFoundException('Actual Food entry not found');
			}

			if (body.loggedMealId !== undefined) {
				await assertLoggedMealBelongsToLog(manager, log.id, body.loggedMealId);
				foodLog.loggedMealId = body.loggedMealId;
			}
			if (body.mealSlot !== undefined) foodLog.mealSlot = body.mealSlot;
			if (body.clientNotes !== undefined) {
				foodLog.clientNotes = normalizeClientNotes(body.clientNotes);
			}
			await applyActualFoodDefinition(manager, foodLog, activeTenantId, body);
			await repository.save(foodLog);
			await touchNutritionLog(manager, log, now);

			return mapReloadedNutritionLog(
				manager,
				activeTenantId,
				membership,
				log.id,
				now,
			);
		});
	}

	async deleteActualFood(
		clientId: string,
		tenantId: string | null,
		logId: string,
		foodLogId: string,
		now = new Date(),
	) {
		const activeTenantId = assertNutritionTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const membership = await getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const log = await lockOwnedWritableLog(
				manager,
				activeTenantId,
				membership.id,
				logId,
				membership.tenant.timezone,
				now,
			);
			const repository = manager.getRepository(FoodLog);
			const foodLog = await repository.findOne({
				where: {
					id: foodLogId,
					tenantId: activeTenantId,
					membershipId: membership.id,
					nutritionDayLogId: log.id,
				},
			});
			if (!foodLog) {
				throw new NotFoundException('Actual Food entry not found');
			}

			await repository.remove(foodLog);
			await touchNutritionLog(manager, log, now);

			return mapReloadedNutritionLog(
				manager,
				activeTenantId,
				membership,
				log.id,
				now,
			);
		});
	}

	async completeLog(
		clientId: string,
		tenantId: string | null,
		logId: string,
		now = new Date(),
	) {
		const activeTenantId = assertNutritionTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const membership = await getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const log = await lockOwnedWritableLog(
				manager,
				activeTenantId,
				membership.id,
				logId,
				membership.tenant.timezone,
				now,
			);
			const meals = await manager.getRepository(LoggedMeal).find({
				where: { nutritionDayLogId: log.id },
				order: { position: 'ASC' },
			});
			if (
				meals.some((meal) => meal.outcome === NutritionAdherenceOutcome.PENDING)
			) {
				throw new ConflictException(
					'Every planned Meal needs an outcome before the day can be completed',
				);
			}

			log.status = NutritionLogStatus.FINALIZED;
			log.adherenceOutcome = deriveNutritionAdherenceOutcome(
				meals.map((meal) => meal.outcome),
			);
			log.completedAt = now;
			log.updatedAt = now;
			await manager.getRepository(NutritionDayLog).save(log);

			return mapReloadedNutritionLog(
				manager,
				activeTenantId,
				membership,
				log.id,
				now,
			);
		});
	}

	async skipDay(
		clientId: string,
		tenantId: string | null,
		dayId: string,
		now = new Date(),
	) {
		const activeTenantId = assertNutritionTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const membership = await getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const startedLog = await getOrCreateWritableLog(
				manager,
				membership,
				activeTenantId,
				dayId,
				now,
			);
			await lockOwnedWritableLog(
				manager,
				activeTenantId,
				membership.id,
				startedLog.id,
				membership.tenant.timezone,
				now,
			);
			const log = await loadOwnedNutritionLog(
				manager,
				activeTenantId,
				membership.id,
				startedLog.id,
			);
			if (!log) {
				throw new NotFoundException('Nutrition day log could not be loaded');
			}
			if (log.meals.length === 0) {
				throw new ConflictException(
					'A fully flexible day without planned Meals cannot be skipped',
				);
			}

			for (const meal of log.meals) {
				meal.outcome = NutritionAdherenceOutcome.SKIPPED;
			}
			await manager.getRepository(LoggedMeal).save(log.meals);

			log.status = NutritionLogStatus.FINALIZED;
			log.adherenceOutcome = NutritionAdherenceOutcome.SKIPPED;
			log.completedAt = now;
			log.updatedAt = now;
			await manager.getRepository(NutritionDayLog).save(log);

			return mapReloadedNutritionLog(
				manager,
				activeTenantId,
				membership,
				log.id,
				now,
			);
		});
	}
}

/**
 * Resolves the authenticated client inside the selected tenant and requires the
 * membership to be active. Every logging flow calls this first so a valid log,
 * day, or Meal id cannot be used to cross a client or tenant boundary.
 */
async function getActiveMembership(
	manager: EntityManager,
	clientId: string,
	tenantId: string,
) {
	const membership = await manager.getRepository(ClientMembership).findOne({
		where: {
			tenant: { id: tenantId },
			client: { id: clientId },
			status: MembershipStatus.ACTIVE,
		},
		relations: { tenant: true },
	});
	if (!membership) {
		throw new NotFoundException('Active client membership not found');
	}
	return membership;
}

/**
 * Returns the one writable log for a prescribed day or creates it when logging
 * starts for the first time. The parent day is locked before the canonical-log
 * lookup so concurrent start requests cannot both create a log. New logs copy
 * compact Meal-level prescription totals while keeping Food details in the
 * immutable PlannedMealFood snapshot, which avoids storing two Food copies.
 */
async function getOrCreateWritableLog(
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

	const created = await loadOwnedNutritionLog(
		manager,
		tenantId,
		membership.id,
		log.id,
	);
	if (!created) {
		throw new NotFoundException(
			'Created nutrition day log could not be loaded',
		);
	}
	return created;
}

/**
 * Finds and row-locks a nutrition day owned by the active tenant membership.
 * Published and cancelled plans are loaded because an existing log may continue
 * after cancellation; getOrCreateWritableLog separately blocks a new cancelled-
 * plan log. The lock serializes log creation with concurrent day edits and
 * lifecycle changes.
 */
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

/**
 * Finds an owned log, takes a write lock, and confirms it can still change.
 * Locking before mutation prevents Meal updates, completion, and skipping from
 * racing each other, while the tenant and membership predicates prevent access
 * to another client's log.
 */
async function lockOwnedWritableLog(
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

/**
 * Enforces log immutability and the time window after an owned row is locked.
 * Finalized logs must remain historical records, and expired in-progress logs
 * are readable as incomplete but cannot receive more changes.
 */
function assertNutritionLogIsWritable(
	log: NutritionDayLog,
	timezone: string,
	now: Date,
) {
	if (log.status !== NutritionLogStatus.IN_PROGRESS) {
		throw new ConflictException('Finalized nutrition day logs are immutable');
	}
	assertNutritionLoggingWindow(log.scheduledDate, timezone, now);
}

/**
 * Allows writes from tenant-local midnight on the scheduled day until, but not
 * including, 06:00 the next morning. This separate assertion gives mutations a
 * consistent conflict response for future days and expired grace periods.
 */
function assertNutritionLoggingWindow(
	scheduledDate: string,
	timezone: string,
	now: Date,
) {
	if (getDateOnlyInTimeZone(now, timezone) < scheduledDate) {
		throw new ConflictException(
			'Nutrition logging has not opened for this day',
		);
	}
	if (isNutritionLogPastDeadline(scheduledDate, timezone, now)) {
		throw new ConflictException(
			'Nutrition logging deadline has passed for this day',
		);
	}
}

/**
 * Loads the canonical log for one plan day within the active tenant membership.
 * Start/resume uses the day id because the client may not know the log id yet.
 * Planned Meals and Foods are included so the response can show the immutable
 * prescription without copying Food rows into the logging tables.
 */
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

/**
 * Loads a specific log only when both tenant and membership ownership match.
 * It also hydrates ordered Logged Meals and their PlannedMealFood snapshots so
 * reads and post-mutation responses use one complete, tenant-safe query shape.
 */
function loadOwnedNutritionLog(
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

/**
 * Reloads a log after a write and maps the fresh database state to the client
 * response. Reloading avoids returning stale timestamps, outcomes, relations,
 * or generated values held by the pre-save entity.
 */
async function mapReloadedNutritionLog(
	manager: EntityManager,
	tenantId: string,
	membership: ClientMembership,
	logId: string,
	now: Date,
) {
	const reloaded = await loadOwnedNutritionLog(
		manager,
		tenantId,
		membership.id,
		logId,
	);
	if (!reloaded) {
		throw new NotFoundException('Nutrition day log could not be loaded');
	}
	return mapNutritionLogResponse(reloaded, membership.tenant.timezone, now);
}

/**
 * Converts a hydrated NutritionDayLog into the public client response. It adds
 * derived state, retrospective and writable flags, stable Meal prescription
 * totals, and Food details from immutable planned snapshots while hiding ORM
 * relations and internal fields.
 */
function mapNutritionLogResponse(
	log: NutritionDayLog,
	timezone: string,
	now: Date,
) {
	const state = mapNutritionDayLogState(log, log.scheduledDate, timezone, now);
	const foodLogs = [...(log.foodLogs ?? [])].sort(compareActualFoodLogs);

	return {
		id: log.id,
		nutritionPlanId: log.nutritionPlanId,
		nutritionPlanDayId: log.nutritionPlanDayId,
		scheduledDate: log.scheduledDate,
		status: log.status,
		logState: state.logState,
		adherenceOutcome: log.adherenceOutcome,
		waterMlConsumed: log.waterMlConsumed,
		clientNotes: log.clientNotes,
		startedAt: log.startedAt,
		completedAt: log.completedAt,
		isRetrospective: state.isRetrospective,
		isWritable:
			log.status === NutritionLogStatus.IN_PROGRESS &&
			isNutritionLogWindowOpen(log.scheduledDate, timezone, now),
		actualTotals: calculateActualNutritionTotals(foodLogs),
		actualFoods: foodLogs.map(mapActualFoodLogResponse),
		meals: [...(log.meals ?? [])]
			.sort((left, right) => left.position - right.position)
			.map((meal) => {
				const planned = mapPlannedMealResponse(meal.plannedMeal);
				return {
					id: meal.id,
					plannedMealId: meal.plannedMealId,
					sourceMealId: meal.sourceMealId,
					mealName: meal.mealName,
					slot: meal.slot,
					position: meal.position,
					prescribedTotals: {
						calories: meal.prescribedCalories,
						proteinG: meal.prescribedProteinG,
						carbsG: meal.prescribedCarbsG,
						fatG: meal.prescribedFatG,
						fiberG: meal.prescribedFiberG,
					},
					outcome: meal.outcome,
					clientNotes: meal.clientNotes,
					actualTotals: calculateActualNutritionTotals(
						foodLogs.filter((foodLog) => foodLog.loggedMealId === meal.id),
					),
					plannedFoods: planned.foods,
				};
			}),
	};
}

/**
 * Trims client-entered notes and stores blank text as null. Normalizing here
 * keeps day and Meal notes consistent and prevents whitespace-only values from
 * being treated as meaningful content.
 */
function normalizeClientNotes(value: string | null) {
	if (value === null) return null;
	const normalized = value.trim();
	return normalized.length === 0 ? null : normalized;
}

async function assertLoggedMealBelongsToLog(
	manager: EntityManager,
	logId: string,
	loggedMealId: string | null,
) {
	if (loggedMealId === null) return;

	const loggedMeal = await manager.getRepository(LoggedMeal).findOne({
		where: { id: loggedMealId, nutritionDayLogId: logId },
		select: { id: true },
	});
	if (!loggedMeal) {
		throw new NotFoundException('Logged Meal not found');
	}
}

async function applyActualFoodDefinition(
	manager: EntityManager,
	foodLog: FoodLog,
	tenantId: string,
	body: CreateActualFoodLogDto | UpdateActualFoodLogDto,
) {
	const nextFoodId =
		body.foodId === undefined ? foodLog.foodId : (body.foodId ?? null);

	if (nextFoodId) {
		assertNoManualFoodSnapshotFields(body);
		const amount = body.amount === undefined ? foodLog.amount : body.amount;
		if (amount === null || amount === undefined) {
			throw new BadRequestException(
				'amount is required for a library-backed actual Food entry',
			);
		}

		if (foodLog.foodId === nextFoodId) {
			if (body.amount !== undefined && body.amount !== foodLog.amount) {
				assertRealisticActualFoodAmount(
					body.amount,
					foodLog.servingUnit as ServingUnit,
				);
				const snapshot = recalculateLibraryFoodLogAmount(foodLog, body.amount);
				assertRealisticActualFoodNutrients(snapshot);
				Object.assign(foodLog, snapshot);
			}
			return;
		}

		const food = await manager.getRepository(Food).findOne({
			where: {
				id: nextFoodId,
				tenantId,
				isActive: true,
			},
		});
		if (!food) {
			throw new NotFoundException('Active Food not found');
		}
		assertRealisticActualFoodAmount(amount, food.servingUnit);
		const snapshot = calculateLibraryFoodLogSnapshot(food, amount);
		assertRealisticActualFoodNutrients(snapshot);
		Object.assign(foodLog, snapshot);
		return;
	}

	foodLog.foodId = null;
	const suppliedFoodName = body.foodName as string | null | undefined;
	const foodName =
		suppliedFoodName === undefined
			? foodLog.foodName
			: suppliedFoodName === null
				? ''
				: normalizeFoodDisplayText(suppliedFoodName);
	if (!foodName) {
		throw new BadRequestException(
			'foodName is required for a manual actual Food entry',
		);
	}
	foodLog.foodName = foodName;

	if (body.brand !== undefined) {
		foodLog.brand = normalizeNullableFoodDisplayText(body.brand);
	}
	if (body.servingSize !== undefined) {
		foodLog.servingSize = body.servingSize;
	}
	if (body.servingUnit !== undefined) {
		foodLog.servingUnit = body.servingUnit;
	}
	if (body.amount !== undefined) foodLog.amount = body.amount;
	if (body.calories !== undefined) foodLog.calories = body.calories;
	if (body.proteinG !== undefined) foodLog.proteinG = body.proteinG;
	if (body.carbsG !== undefined) foodLog.carbsG = body.carbsG;
	if (body.fatG !== undefined) foodLog.fatG = body.fatG;
	if (body.fiberG !== undefined) foodLog.fiberG = body.fiberG;

	if (foodLog.servingSize !== null && foodLog.servingUnit !== null) {
		assertRealisticFoodReferenceAmount(
			foodLog.servingSize,
			foodLog.servingUnit,
		);
	}
	if (foodLog.amount !== null && foodLog.servingUnit !== null) {
		assertRealisticActualFoodAmount(foodLog.amount, foodLog.servingUnit);
	}
	assertRealisticActualFoodNutrients(foodLog);
}

function assertNoManualFoodSnapshotFields(
	body: CreateActualFoodLogDto | UpdateActualFoodLogDto,
) {
	const manualFields = [
		'foodName',
		'brand',
		'servingSize',
		'servingUnit',
		'calories',
		'proteinG',
		'carbsG',
		'fatG',
		'fiberG',
	] as const;
	if (manualFields.some((field) => body[field] !== undefined)) {
		throw new BadRequestException(
			'Library-backed entries accept foodId and amount; Food details are copied by the server',
		);
	}
}

async function touchNutritionLog(
	manager: EntityManager,
	log: NutritionDayLog,
	now: Date,
) {
	log.updatedAt = now;
	await manager.getRepository(NutritionDayLog).save(log);
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
