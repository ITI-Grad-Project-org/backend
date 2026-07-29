import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import {
	CreateActualFoodLogDto,
	UpdateActualFoodLogDto,
} from '../dto/nutrition-logging.dto';
import { FoodLog } from '../entities/food-log.entity';
import { mapClientNutritionLog } from '../mappers/client-nutrition-log.mapper';
import {
	applyActualFoodDefinition,
	assertLoggedMealBelongsToLog,
} from '../persistence/actual-food-log.persistence';
import { findActiveClientNutritionMembership } from '../persistence/client-nutrition-access.persistence';
import {
	loadOwnedNutritionLogOrFail,
	lockOwnedWritableNutritionLog,
	touchNutritionLog,
} from '../persistence/client-nutrition-logging.persistence';
import { assertNutritionTenant } from '../utils/client-nutrition-plan.utils';
import { normalizeClientNotes } from '../utils/nutrition-logging.utils';

@Injectable()
export class ClientNutritionActualFoodService {
	constructor(private readonly dataSource: DataSource) {}

	async createActualFood(
		clientId: string,
		tenantId: string | null,
		logId: string,
		body: CreateActualFoodLogDto,
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

			return this.reloadAndMapLog(
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

			return this.reloadAndMapLog(
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
