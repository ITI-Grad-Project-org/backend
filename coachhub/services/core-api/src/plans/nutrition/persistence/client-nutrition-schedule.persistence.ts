import { In, Repository } from 'typeorm';
import { ClientIntake } from '../../../clients/entities/client-intake.entity';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { NutritionPlanStatus, NutritionPlanType } from '../../../common';
import { NutritionDayLog } from '../entities/nutrition-day-log.entity';
import { NutritionLogStateSource } from '../utils/nutrition-log-state.utils';

export function publishedClientNutritionPlanScope(
	tenantId: string,
	membershipId: string,
) {
	return {
		tenantId,
		membershipId,
		planType: NutritionPlanType.CLIENT,
		status: NutritionPlanStatus.PUBLISHED,
	};
}

export function clientNutritionPlanBuilderRelations() {
	return { weeks: { days: { meals: { foods: true } } } } as const;
}

export function clientNutritionPlanBuilderOrder() {
	return {
		weeks: {
			weekNumber: 'ASC' as const,
			days: {
				dayNumber: 'ASC' as const,
				meals: {
					position: 'ASC' as const,
					foods: { position: 'ASC' as const },
				},
			},
		},
	};
}

export function loadClientDietaryProfile(
	repository: Repository<ClientIntake>,
	membership: ClientMembership,
) {
	return repository.findOne({
		where: {
			membership: { id: membership.id },
			tenant: { id: membership.tenant.id },
		},
	});
}

export async function loadNutritionLogStates(
	repository: Repository<NutritionDayLog>,
	membership: ClientMembership,
	planIds: string[],
) {
	const byDayId = new Map<string, NutritionLogStateSource>();
	if (planIds.length === 0) return byDayId;

	const logs = await repository.find({
		where: {
			tenantId: membership.tenant.id,
			membershipId: membership.id,
			nutritionPlanId: In(planIds),
		},
	});
	for (const log of logs) {
		byDayId.set(log.nutritionPlanDayId, {
			id: log.id,
			status: log.status,
			adherenceOutcome: log.adherenceOutcome,
			startedAt: log.startedAt,
			completedAt: log.completedAt,
			updatedAt: log.updatedAt,
		});
	}
	return byDayId;
}
