import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProgramStatus, SetType } from '../../../common';
import { PrescribedSetDto } from '../dto/prescribe-exercise.dto';
import { ProgramDay } from '../entities/program-day.entity';
import { Program } from '../entities/program.entity';
import {
	getDateOnlyInTimeZone,
	getScheduledDate,
	isValidDateOnly,
} from './program-date.utils';

export type ProgramSchedulePhase = 'scheduled' | 'active' | 'ended';

export function assertActiveTenant(tenantId: string | null) {
	if (!tenantId) {
		throw new BadRequestException('No active tenant selected');
	}
	return tenantId;
}

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

export function normalizeOptionalText(value?: string | null) {
	if (value == null) return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

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

export function assertWorkoutDay(day: ProgramDay) {
	if (day.isRestDay) {
		throw new ConflictException('Exercises cannot be added to a rest day');
	}
}

export function validateSetPrescriptions(sets: PrescribedSetDto[]) {
	for (const set of sets) {
		if (
			set.repsMin !== undefined &&
			set.repsMax !== undefined &&
			set.repsMax < set.repsMin
		) {
			throw new BadRequestException('Max reps cannot be less than Min reps');
		}
	}
}

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
