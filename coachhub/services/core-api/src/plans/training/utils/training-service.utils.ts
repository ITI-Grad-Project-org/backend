import { BadRequestException, ConflictException } from '@nestjs/common';
import { IntensityType, ProgramStatus, SetType } from '../../../common';
import { PrescribedSetDto } from '../dto/prescribe-exercise.dto';
import { ProgramDay } from '../entities/program-day.entity';
import { Program } from '../entities/program.entity';
import {
	getDateOnlyInTimeZone,
	getScheduledDate,
	isValidDateOnly,
} from './program-date.utils';
import { TRAINING_VALIDATION_LIMITS } from './training-validation.constants';

export type ProgramSchedulePhase = 'scheduled' | 'active' | 'ended';

/**
 * Narrows a nullable JWT tenant id to a usable tenant id. Failing here prevents
 * downstream queries from running without the tenant security boundary.
 */
export function assertActiveTenant(tenantId: string | null) {
	if (!tenantId) {
		throw new BadRequestException('No active tenant selected');
	}
	return tenantId;
}

/**
 * Validates a real date-only start value and rejects dates already past in the
 * tenant's timezone, rather than comparing against the API server's local date.
 */
export function assertStartDate(startDate: string, timezone: string) {
	if (!isValidDateOnly(startDate)) {
		throw new BadRequestException('startDate must be a valid date');
	}

	const today = getDateOnlyInTimeZone(new Date(), timezone);
	if (startDate < today) {
		throw new BadRequestException(
			'startDate cannot be before today in the tenant timezone',
		);
	}
}

/** Validates ordered, real date-only bounds and caps calendar query size. */
export function assertTrainingCalendarRange(from: string, to: string) {
	if (!isValidDateOnly(from) || !isValidDateOnly(to)) {
		throw new BadRequestException('Calendar range dates must be valid');
	}
	if (from > to) {
		throw new BadRequestException(
			'Calendar range from date cannot be after to date',
		);
	}

	const fromTimestamp = Date.parse(`${from}T00:00:00Z`);
	const toTimestamp = Date.parse(`${to}T00:00:00Z`);
	const inclusiveDays = (toTimestamp - fromTimestamp) / 86_400_000 + 1;
	if (inclusiveDays > TRAINING_VALIDATION_LIMITS.calendarRangeDays) {
		throw new BadRequestException(
			`Calendar range cannot exceed ${TRAINING_VALIDATION_LIMITS.calendarRangeDays} days`,
		);
	}
}

/**
 * Trims optional user text and stores blank values as null. This gives names,
 * notes, and descriptions one predictable empty representation in the database.
 */
export function normalizeOptionalText(value?: string | null) {
	if (value == null) return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * Derives the client's scheduled/active/ended view from dates at read time.
 * Draft and cancelled programs return null because those are stored lifecycle
 * states, not date-driven schedule phases.
 */
export function deriveProgramSchedulePhase(
	program: Pick<Program, 'status' | 'startDate' | 'endDate'>,
	timezone: string,
	now = new Date(),
): ProgramSchedulePhase | null {
	if (
		program.status !== ProgramStatus.PUBLISHED ||
		!program.startDate ||
		!program.endDate
	) {
		return null;
	}

	const today = getDateOnlyInTimeZone(now, timezone);
	if (today < program.startDate) return 'scheduled';
	if (today > program.endDate) return 'ended';
	return 'active';
}

/**
 * Adds the derived schedule phase to a program without changing the stored
 * entity. Keeping this as response mapping avoids persisting stale phase data.
 */
export function mapClientProgramSummary(
	program: Program,
	timezone: string,
	now = new Date(),
) {
	return {
		...program,
		schedulePhase: deriveProgramSchedulePhase(program, timezone, now),
	};
}

/**
 * Maps the full builder tree and calculates a scheduled date for every day.
 * Consumers receive calendar-ready data while the database keeps only relative
 * week and day numbers.
 */
export function mapBuilderProgram(
	program: Program,
	timezone = 'UTC',
	now = new Date(),
) {
	return {
		...mapClientProgramSummary(program, timezone, now),
		weeks: (program.weeks ?? []).map((week) => ({
			...week,
			days: (week.days ?? []).map((day) => ({
				...day,
				scheduledDate: getScheduledDate(
					program.startDate as string,
					week.weekNumber,
					day.dayNumber,
				),
			})),
		})),
	};
}

/**
 * Rejects exercise mutations on explicit rest days. This protects the invariant
 * that a publishable day is either rest or contains exercises, never both.
 */
export function assertWorkoutDay(day: ProgramDay) {
	if (day.isRestDay) {
		throw new ConflictException('Exercises cannot be added to a rest day');
	}
}

/**
 * Validates relationships between set fields that decorators cannot express:
 * prescription mode, rep-range order, required targets, and intensity pairing
 * and ranges.
 */
export function validateSetPrescriptions(sets: PrescribedSetDto[]) {
	for (const set of sets) {
		const setType = set.setType ?? SetType.WORKING;
		const hasRepsMin = set.repsMin != null;
		const hasRepsMax = set.repsMax != null;
		const hasDuration = set.durationSeconds != null;

		if (hasRepsMax && !hasRepsMin) {
			throw new BadRequestException('repsMax requires repsMin');
		}
		if (hasRepsMin && hasDuration) {
			throw new BadRequestException(
				'A set must be prescribed by repetitions or duration, not both',
			);
		}
		if (
			!hasRepsMin &&
			!hasDuration &&
			![SetType.AMRAP, SetType.TO_FAILURE, SetType.DROP_SET].includes(setType)
		) {
			throw new BadRequestException(
				'Repetitions or duration is required for this set type',
			);
		}
		if (hasRepsMin && hasRepsMax && set.repsMax < set.repsMin) {
			throw new BadRequestException('Max reps cannot be less than Min reps');
		}

		const hasIntensityType = set.intensityType != null;
		const hasIntensityValue = set.intensityValue != null;
		if (hasIntensityType !== hasIntensityValue) {
			throw new BadRequestException(
				'intensityType and intensityValue must be provided together',
			);
		}
		if (!hasIntensityType || !hasIntensityValue) continue;

		switch (set.intensityType) {
			case IntensityType.RPE:
				assertIntensityRange(set.intensityValue, 1, 10, 'RPE');
				break;
			case IntensityType.RIR:
				assertIntensityRange(set.intensityValue, 0, 10, 'RIR');
				break;
			case IntensityType.PERCENT_1RM:
				assertIntensityRange(set.intensityValue, 1, 100, '%1RM');
				break;
		}
	}
}

function assertIntensityRange(
	value: number,
	minimum: number,
	maximum: number,
	label: string,
) {
	if (value < minimum || value > maximum) {
		throw new BadRequestException(
			`${label} must be between ${minimum} and ${maximum}`,
		);
	}
}

/**
 * Converts an incoming set prescription into the entity fields and applies the
 * default set type. Missing optional targets become null for consistent storage.
 */
export function mapPlannedSet(set: PrescribedSetDto, setNumber: number) {
	return {
		setNumber,
		setType: set.setType ?? SetType.WORKING,
		repsMin: set.repsMin ?? null,
		repsMax: set.repsMax ?? null,
		durationSeconds: set.durationSeconds ?? null,
		weightKg: set.weightKg ?? null,
		intensityType: set.intensityType ?? null,
		intensityValue: set.intensityValue ?? null,
	};
}
