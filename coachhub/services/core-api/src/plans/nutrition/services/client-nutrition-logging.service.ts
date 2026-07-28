import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { NutritionAdherenceOutcome, NutritionLogStatus } from '../../../common';
import {
	UpdateLoggedMealOutcomeDto,
	UpdateNutritionDayLogDto,
} from '../dto/nutrition-logging.dto';
import { LoggedMeal } from '../entities/logged-meal.entity';
import { NutritionDayLog } from '../entities/nutrition-day-log.entity';
import { mapClientNutritionLog } from '../mappers/client-nutrition-log.mapper';
import { findActiveClientNutritionMembership } from '../persistence/client-nutrition-access.persistence';
import {
	getOrCreateWritableNutritionLog,
	loadOwnedNutritionLog,
	loadOwnedNutritionLogOrFail,
	lockOwnedWritableNutritionLog,
	touchNutritionLog,
} from '../persistence/client-nutrition-logging.persistence';
import { assertNutritionTenant } from '../utils/client-nutrition-plan.utils';
import { normalizeClientNotes } from '../utils/nutrition-logging.utils';
import { deriveNutritionAdherenceOutcome } from '../utils/nutrition-log-state.utils';

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
			const membership = await this.getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const log = await getOrCreateWritableNutritionLog(
				manager,
				membership,
				activeTenantId,
				dayId,
				now,
			);
			return mapClientNutritionLog(log, membership.tenant.timezone, now);
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
		const membership = await this.getActiveMembership(
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

		return mapClientNutritionLog(log, membership.tenant.timezone, now);
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
			const membership = await this.getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const log = await lockOwnedWritableNutritionLog(
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

			return this.reloadAndMapLog(
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
			const membership = await this.getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const log = await lockOwnedWritableNutritionLog(
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
			await touchNutritionLog(manager, log, now);

			return this.reloadAndMapLog(
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
			const membership = await this.getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const log = await lockOwnedWritableNutritionLog(
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

			return this.reloadAndMapLog(
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
			const membership = await this.getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const startedLog = await getOrCreateWritableNutritionLog(
				manager,
				membership,
				activeTenantId,
				dayId,
				now,
			);
			await lockOwnedWritableNutritionLog(
				manager,
				activeTenantId,
				membership.id,
				startedLog.id,
				membership.tenant.timezone,
				now,
			);
			const log = await loadOwnedNutritionLogOrFail(
				manager,
				activeTenantId,
				membership.id,
				startedLog.id,
			);
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

			return this.reloadAndMapLog(
				manager,
				activeTenantId,
				membership,
				log.id,
				now,
			);
		});
	}

	private getActiveMembership(
		manager: EntityManager,
		clientId: string,
		tenantId: string,
	) {
		return findActiveClientNutritionMembership(
			manager.getRepository(ClientMembership),
			clientId,
			tenantId,
		);
	}

	private async reloadAndMapLog(
		manager: EntityManager,
		tenantId: string,
		membership: ClientMembership,
		logId: string,
		now: Date,
	) {
		const reloaded = await loadOwnedNutritionLogOrFail(
			manager,
			tenantId,
			membership.id,
			logId,
		);
		return mapClientNutritionLog(reloaded, membership.tenant.timezone, now);
	}
}
