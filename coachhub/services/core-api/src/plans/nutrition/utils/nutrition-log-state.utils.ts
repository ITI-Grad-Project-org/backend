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
 * using the tenant's local calendar and clock. The check is derived instead of
 * stored so expired logs can become read-only without a background database job.
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

/**
 * Marks activity after the scheduled tenant-local calendar day as retrospective.
 * The flag keeps late-night submissions visible to clients and coaches without
 * rejecting them during the allowed next-morning grace period.
 */
export function isNutritionLogRetrospective(
	scheduledDate: string,
	timezone: string,
	activityAt: Date,
) {
	return getDateOnlyInTimeZone(activityAt, timezone) > scheduledDate;
}

/**
 * Returns whether the current tenant-local time is inside the complete write
 * window: from scheduled-day midnight until 06:00 the next morning. Response
 * mapping uses this helper to expose isWritable from the same rules enforced by
 * mutation services.
 */
export function isNutritionLogWindowOpen(
	scheduledDate: string,
	timezone: string,
	now = new Date(),
) {
	return (
		getDateOnlyInTimeZone(now, timezone) >= scheduledDate &&
		!isNutritionLogPastDeadline(scheduledDate, timezone, now)
	);
}

/**
 * Derives one final day outcome from all planned Meal outcomes. Empty outcome
 * lists represent fully flexible days and map to not-applicable later; uniform
 * completed or skipped lists keep that result, while partial or mixed lists
 * become partial. Centralizing this rule makes finalization deterministic.
 */
export function deriveNutritionAdherenceOutcome(
	outcomes: NutritionAdherenceOutcome[],
): NutritionAdherenceOutcome | null {
	if (outcomes.length === 0) return null;
	if (
		outcomes.every((outcome) => outcome === NutritionAdherenceOutcome.COMPLETED)
	) {
		return NutritionAdherenceOutcome.COMPLETED;
	}
	if (
		outcomes.every((outcome) => outcome === NutritionAdherenceOutcome.SKIPPED)
	) {
		return NutritionAdherenceOutcome.SKIPPED;
	}
	return NutritionAdherenceOutcome.PARTIAL;
}

/**
 * Converts a nullable stored log into the client-facing state used by plan,
 * calendar, day, and log responses. It derives incomplete from the deadline,
 * derives retrospective from the latest activity, and deliberately omits the
 * internal updatedAt field from the nested response.
 */

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

/**
 * Converts a finalized database outcome into its display state. A null outcome
 * means a fully flexible day with no planned Meals, so it becomes
 * not_applicable rather than looking incomplete or skipped.
 */
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

/**
 * Formats only the tenant-local clock portion of an instant as HH:mm:ss. The
 * deadline helper needs this stable 24-hour value to make the exact 06:00:00
 * boundary comparison independent of the server's own timezone.
 */
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
