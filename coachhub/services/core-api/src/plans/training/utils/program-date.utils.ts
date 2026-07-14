const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateOnly(value: string) {
	const match = DATE_ONLY_PATTERN.exec(value);
	if (!match) return false;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));

	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

export function addDaysToDateOnly(value: string, days: number) {
	if (!isValidDateOnly(value)) {
		throw new RangeError('Invalid date-only value');
	}

	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}
export function getDateOnlyInTimeZone(date: Date, timezone: string) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(date);
	const values = Object.fromEntries(
		parts.map((part) => [part.type, part.value]),
	);

	return `${values.year}-${values.month}-${values.day}`;
}

export function deriveInclusiveEndDate(
	startDate: string,
	durationWeeks: number,
) {
	return addDaysToDateOnly(startDate, durationWeeks * 7 - 1);
}

export function getScheduledDate(
	startDate: string,
	weekNumber: number,
	dayNumber: number,
) {
	return addDaysToDateOnly(startDate, (weekNumber - 1) * 7 + (dayNumber - 1));
}
