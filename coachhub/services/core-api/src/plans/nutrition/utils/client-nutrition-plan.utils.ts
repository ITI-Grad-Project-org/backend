import { BadRequestException } from '@nestjs/common';
import {
	getDateOnlyInTimeZone,
	isValidDateOnly,
	NutritionPlanStatus,
} from '../../../common';
import { NutritionPlan } from '../entities/nutrition-plan.entity';

export type NutritionPlanSchedulePhase = 'scheduled' | 'active' | 'ended';

export function assertNutritionTenant(tenantId: string | null) {
	if (!tenantId) {
		throw new BadRequestException('No active tenant selected');
	}
	return tenantId;
}

export function assertNutritionStartDate(
	startDate: string,
	timezone: string,
	now = new Date(),
) {
	if (!isValidDateOnly(startDate)) {
		throw new BadRequestException('startDate must be a valid date');
	}

	const today = getDateOnlyInTimeZone(now, timezone);
	if (startDate < today) {
		throw new BadRequestException(
			'startDate cannot be before today in the tenant timezone',
		);
	}
}

export function normalizeNutritionPlanText(value?: string | null) {
	if (value == null) return null;
	const normalized = value.trim();
	return normalized || null;
}

export function deriveNutritionPlanSchedulePhase(
	plan: Pick<NutritionPlan, 'status' | 'startDate' | 'endDate'>,
	timezone: string,
	now = new Date(),
): NutritionPlanSchedulePhase | null {
	if (
		plan.status !== NutritionPlanStatus.PUBLISHED ||
		!plan.startDate ||
		!plan.endDate
	) {
		return null;
	}

	const today = getDateOnlyInTimeZone(now, timezone);
	if (today < plan.startDate) return 'scheduled';
	if (today > plan.endDate) return 'ended';
	return 'active';
}
