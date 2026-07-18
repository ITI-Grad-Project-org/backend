import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProgramStatus, SessionStatus, SetOutcome } from '../../../common';
import { PlannedExercise } from '../entities/planned-exercise.entity';
import { ProgramDay } from '../entities/program-day.entity';
import { Program } from '../entities/program.entity';
import { addDaysToDateOnly } from './program-date.utils';

export const SUBMITTED_SET_OUTCOMES = [
	SetOutcome.COMPLETED,
	SetOutcome.PARTIAL,
	SetOutcome.SKIPPED,
];
export const EXTRA_SET_OUTCOMES = [SetOutcome.COMPLETED, SetOutcome.PARTIAL];

export type ActualSetInput = {
	outcome: SetOutcome;
	reps?: number | null;
	weightKg?: number | null;
	durationSeconds?: number | null;
	rpe?: number | null;
};

export type ActualSetValues = {
	reps: number | null;
	weightKg: number | null;
	durationSeconds: number | null;
	rpe: number | null;
};

/**
 * Confirms that the selected day belongs to a published workout and is not a
 * rest day. This blocks logging against drafts, cancelled plans, and rest days.
 */
export function assertLoggableLifecycle(program: Program, day: ProgramDay) {
	if (program.status !== ProgramStatus.PUBLISHED) {
		throw new ConflictException(
			'Only published, non-cancelled program days can be logged',
		);
	}
	if (day.isRestDay) {
		throw new ConflictException('Rest days cannot be logged as workouts');
	}
}

/**
 * Enforces the allowed calendar window for starting a log: not in the future,
 * not after program end, and no earlier than today minus six calendar days.
 */
export function assertLoggingWindow(
	scheduledDate: string,
	today: string,
	programEndDate: string | null,
) {
	if (!programEndDate || today > programEndDate) {
		throw new ConflictException('Ended programs cannot start workout logs');
	}
	if (scheduledDate > today) {
		throw new ConflictException('Future program days cannot be logged');
	}

	const earliestAllowedDate = addDaysToDateOnly(today, -6);
	if (scheduledDate < earliestAllowedDate) {
		throw new ConflictException(
			'Program days can only be logged within the seven-day backfill window',
		);
	}
}

/**
 * Ensures the day has an exercise snapshot source and every exercise has sets.
 * Without a complete prescription, a meaningful canonical workout log cannot
 * be created.
 */
export function assertCompletePrescription(
	plannedExercises: PlannedExercise[],
) {
	if (plannedExercises.length === 0) {
		throw new ConflictException('Workout day has no exercise prescription');
	}
	if (plannedExercises.some((exercise) => exercise.sets.length === 0)) {
		throw new ConflictException(
			'Every prescribed exercise must contain at least one set',
		);
	}
}

/**
 * Derives the final session status from prescribed-set outcomes. Pending sets
 * block finalization; otherwise all completed/all skipped map directly and a
 * mixed result becomes partial.
 */
export function deriveCompletedWorkoutStatus(outcomes: SetOutcome[]) {
	if (outcomes.length === 0) {
		throw new ConflictException('Workout log has no prescribed sets');
	}
	if (outcomes.some((outcome) => outcome === SetOutcome.PENDING)) {
		throw new ConflictException(
			'Every prescribed set needs a final outcome before completion',
		);
	}
	if (outcomes.every((outcome) => outcome === SetOutcome.COMPLETED)) {
		return SessionStatus.COMPLETED;
	}
	if (outcomes.every((outcome) => outcome === SetOutcome.SKIPPED)) {
		return SessionStatus.SKIPPED;
	}
	return SessionStatus.PARTIAL;
}

/**
 * Validates an allowed outcome and merges a partial set update with stored
 * actuals. Skipped sets are cleared, while completed/partial sets must retain
 * at least one actual performance value.
 */
export function resolveActualValues(
	input: ActualSetInput,
	current: ActualSetValues | undefined,
	allowedOutcomes: SetOutcome[],
): ActualSetValues {
	if (!allowedOutcomes.includes(input.outcome)) {
		throw new BadRequestException('Invalid submitted set outcome');
	}

	if (input.outcome === SetOutcome.SKIPPED) {
		if (hasAnySubmittedActual(input)) {
			throw new BadRequestException(
				'Skipped sets cannot contain actual performance values',
			);
		}
		return emptyActualValues();
	}

	const actuals = {
		reps: input.reps === undefined ? (current?.reps ?? null) : input.reps,
		weightKg:
			input.weightKg === undefined
				? (current?.weightKg ?? null)
				: input.weightKg,
		durationSeconds:
			input.durationSeconds === undefined
				? (current?.durationSeconds ?? null)
				: input.durationSeconds,
		rpe: input.rpe === undefined ? (current?.rpe ?? null) : input.rpe,
	};
	if (!Object.values(actuals).some((value) => value !== null)) {
		throw new BadRequestException(
			'Completed and partial sets require actual performance data',
		);
	}
	return actuals;
}

/**
 * Produces the canonical empty actual-value shape. Reusing it ensures every
 * skipped set clears reps, weight, duration, and RPE in the same way.
 */
export function emptyActualValues(): ActualSetValues {
	return {
		reps: null,
		weightKg: null,
		durationSeconds: null,
		rpe: null,
	};
}

/** Checks whether the request supplied any actual performance measurement. */
function hasAnySubmittedActual(input: ActualSetInput) {
	return [input.reps, input.weightKg, input.durationSeconds, input.rpe].some(
		(value) => value != null,
	);
}
