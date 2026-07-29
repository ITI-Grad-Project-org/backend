import { ConflictException } from '@nestjs/common';
import {
	getDateOnlyInTimeZone,
	getScheduledDate,
	NutritionPlanStatus,
} from '../../../common';
import { NutritionPlan } from '../entities/nutrition-plan.entity';

/** Rejects a draft that has become historical while it was being built. */
export function assertNutritionPlanStartDateIsPublishable(
	startDate: string,
	timezone: string,
	now = new Date(),
) {
	const today = getDateOnlyInTimeZone(now, timezone);
	if (startDate < today) {
		throw new ConflictException(
			'Client nutrition plans cannot be published after their start date has passed',
		);
	}
}

/** Allows cancellation only while a published plan is scheduled or active. */
export function assertNutritionPlanCanBeCancelled(
	plan: Pick<NutritionPlan, 'status' | 'endDate'>,
	timezone: string,
	now = new Date(),
) {
	if (plan.status === NutritionPlanStatus.CANCELLED) {
		throw new ConflictException('Client nutrition plan is already cancelled');
	}
	if (plan.status !== NutritionPlanStatus.PUBLISHED) {
		throw new ConflictException(
			'Only scheduled or active published client nutrition plans can be cancelled',
		);
	}

	const today = getDateOnlyInTimeZone(now, timezone);
	if ((plan.endDate as string) < today) {
		throw new ConflictException(
			'Ended client nutrition plans cannot be cancelled',
		);
	}
}

/** Applies the tenant-local date and canonical-log edit boundary to a day. */
export function assertPublishedNutritionDayIsEditable(
	startDate: string,
	weekNumber: number,
	dayNumber: number,
	timezone: string,
	hasCanonicalLog: boolean,
	now = new Date(),
) {
	const scheduledDate = getScheduledDate(startDate, weekNumber, dayNumber);
	const today = getDateOnlyInTimeZone(now, timezone);
	if (scheduledDate < today) {
		throw new ConflictException(
			'Past published nutrition plan days cannot be edited',
		);
	}
	if (hasCanonicalLog) {
		throw new ConflictException(
			'Published nutrition plan day cannot be edited after nutrition logging has started',
		);
	}
}
