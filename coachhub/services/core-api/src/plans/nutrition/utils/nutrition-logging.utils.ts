import { ConflictException } from '@nestjs/common';
import {
	getDateOnlyInTimeZone,
	NutritionAdherenceOutcome,
	NutritionLogStatus,
} from '../../../common';
import { NutritionDayLog } from '../entities/nutrition-day-log.entity';
import { isNutritionLogPastDeadline } from './nutrition-log-state.utils';

export function assertNutritionLogIsWritable(
	log: NutritionDayLog,
	timezone: string,
	now: Date,
) {
	if (log.status !== NutritionLogStatus.IN_PROGRESS) {
		throw new ConflictException('Finalized nutrition day logs are immutable');
	}
	assertNutritionLoggingWindow(log.scheduledDate, timezone, now);
}

export function assertNutritionLoggingWindow(
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

export function normalizeClientNotes(value: string | null) {
	if (value === null) return null;
	const normalized = value.trim();
	return normalized.length === 0 ? null : normalized;
}

export function isReportedMeal(outcome: NutritionAdherenceOutcome) {
	return (
		outcome === NutritionAdherenceOutcome.COMPLETED ||
		outcome === NutritionAdherenceOutcome.PARTIAL
	);
}
