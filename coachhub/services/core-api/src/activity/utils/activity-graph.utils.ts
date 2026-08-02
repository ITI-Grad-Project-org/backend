import { BadRequestException } from '@nestjs/common';
import {
	addDaysToDateOnly,
	isValidDateOnly,
} from '../../common/utils/date-only.utils';

export type ActivityLevel = 0 | 1 | 2 | 3 | 4;
export type ActivityGraphPeriodMode = 'rolling' | 'calendar_year';

export interface ActivityGraphPeriod {
	mode: ActivityGraphPeriodMode;
	year: number | null;
	from: string;
	to: string;
}

/** Resolves the dates that the graph endpoint should return. */
export function resolveActivityGraphPeriod(
	clientToday: string,
	year?: number,
): ActivityGraphPeriod {
	if (!isValidDateOnly(clientToday)) {
		throw new RangeError('clientToday must use YYYY-MM-DD date-only format');
	}

	if (year === undefined) {
		return {
			mode: 'rolling',
			year: null,
			from: addDaysToDateOnly(clientToday, -364),
			to: clientToday,
		};
	}

	if (!Number.isInteger(year) || year < 2000 || year > 3000) {
		throw new BadRequestException('year must be a four-digit integer');
	}

	const currentYear = Number(clientToday.slice(0, 4));
	if (year > currentYear) {
		throw new BadRequestException('year cannot be in the future');
	}

	return {
		mode: 'calendar_year',
		year,
		from: `${year}-01-01`,
		to: year === currentYear ? clientToday : `${year}-12-31`,
	};
}

/** Returns every date from the first date through the last date, inclusive. */
export function getDatesInRange(from: string, to: string) {
	if (!isValidDateOnly(from) || !isValidDateOnly(to) || from > to) {
		throw new RangeError('Invalid activity graph date range');
	}

	const dates: string[] = [];
	for (let date = from; date <= to; date = addDaysToDateOnly(date, 1)) {
		dates.push(date);
	}
	return dates;
}

/** Maps a daily activity count to the graph brightness level. */
export function getActivityLevel(activityCount: number): ActivityLevel {
	if (activityCount <= 0) return 0;
	if (activityCount <= 7) return 1;
	if (activityCount <= 14) return 2;
	if (activityCount <= 21) return 3;
	return 4;
}

/** Calculates the active streak that is still current on clientToday. */
export function getCurrentActivityStreak(
	activeDates: string[],
	clientToday: string,
) {
	const activeDateSet = new Set(activeDates);
	const yesterday = addDaysToDateOnly(clientToday, -1);
	let date = activeDateSet.has(clientToday) ? clientToday : yesterday;

	if (!activeDateSet.has(date)) return 0;

	let streak = 0;
	while (activeDateSet.has(date)) {
		streak += 1;
		date = addDaysToDateOnly(date, -1);
	}
	return streak;
}

/** Calculates the longest consecutive run in the client's full history. */
export function getLongestActivityStreak(activeDates: string[]) {
	const sortedDates = [...new Set(activeDates)].sort();
	if (sortedDates.length === 0) return 0;

	let longestStreak = 1;
	let currentStreak = 1;
	for (let index = 1; index < sortedDates.length; index += 1) {
		const previousDate = sortedDates[index - 1];
		const currentDate = sortedDates[index];
		if (currentDate === addDaysToDateOnly(previousDate, 1)) {
			currentStreak += 1;
		} else {
			currentStreak = 1;
		}
		longestStreak = Math.max(longestStreak, currentStreak);
	}
	return longestStreak;
}
