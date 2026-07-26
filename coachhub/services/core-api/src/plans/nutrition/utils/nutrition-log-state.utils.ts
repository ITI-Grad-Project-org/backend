import {
	addDaysToDateOnly,
	getDateOnlyInTimeZone,
	NutritionAdherenceOutcome,
	NutritionLogStatus,
} from '../../../common';

export type ClientNutritionLogState =
	| 'not_started'
	| 'in_progress'
	| 'incomplete'
	| 'completed'
	| 'partial'
	| 'skipped'
	| 'not_applicable';

export interface NutritionLogStateSource {
	id: string;
	status: NutritionLogStatus;
	adherenceOutcome: NutritionAdherenceOutcome | null;
	startedAt: Date;
	completedAt: Date | null;
	updatedAt: Date;
}

/**
 * Returns true at or after 06:00 on the day after the scheduled nutrition day,
 * using the tenant's local calendar and clock.
 */
export function isNutritionLogPastDeadline(
	scheduledDate: string,
	timezone: string,
	now = new Date(),
) {
	const deadlineDate = addDaysToDateOnly(scheduledDate, 1);
	const localDate = getDateOnlyInTimeZone(now, timezone);
	if (localDate < deadlineDate) return false;
	if (localDate > deadlineDate) return true;

	return getTimeOnlyInTimeZone(now, timezone) >= '06:00:00';
}

/** A submission after the scheduled local calendar day is retrospective. */
export function isNutritionLogRetrospective(
	scheduledDate: string,
	timezone: string,
	activityAt: Date,
) {
	return getDateOnlyInTimeZone(activityAt, timezone) > scheduledDate;
}

export function mapNutritionDayLogState(
	log: NutritionLogStateSource | null,
	scheduledDate: string,
	timezone: string,
	now = new Date(),
): {
	logState: ClientNutritionLogState;
	isRetrospective: boolean;
	nutritionLog: Omit<NutritionLogStateSource, 'updatedAt'> | null;
} {
	if (!log) {
		return {
			logState: 'not_started',
			isRetrospective: false,
			nutritionLog: null,
		};
	}

	const activityAt = log.completedAt ?? log.updatedAt ?? log.startedAt;
	const isRetrospective = isNutritionLogRetrospective(
		scheduledDate,
		timezone,
		activityAt,
	);
	const { updatedAt: _updatedAt, ...nutritionLog } = log;

	if (log.status === NutritionLogStatus.IN_PROGRESS) {
		return {
			logState: isNutritionLogPastDeadline(scheduledDate, timezone, now)
				? 'incomplete'
				: 'in_progress',
			isRetrospective,
			nutritionLog,
		};
	}

	return {
		logState: mapFinalizedOutcome(log.adherenceOutcome),
		isRetrospective,
		nutritionLog,
	};
}

function mapFinalizedOutcome(
	outcome: NutritionAdherenceOutcome | null,
): ClientNutritionLogState {
	switch (outcome) {
		case NutritionAdherenceOutcome.COMPLETED:
			return 'completed';
		case NutritionAdherenceOutcome.PARTIAL:
			return 'partial';
		case NutritionAdherenceOutcome.SKIPPED:
			return 'skipped';
		default:
			return 'not_applicable';
	}
}

function getTimeOnlyInTimeZone(date: Date, timezone: string) {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(date);
	const values = Object.fromEntries(
		parts.map((part) => [part.type, part.value]),
	);

	return `${values.hour}:${values.minute}:${values.second}`;
}
