/**
 * Readers for the stored plan.
 *
 * The plan is a `jsonb` blob that a language model wrote. It has been through a
 * schema and a validator, but it is still the only data in this codebase whose
 * shape nothing in TypeScript guarantees — and it may have been written by an
 * older version of either. Every read goes through here so that a surprise is a
 * null rather than a `TypeError` thrown halfway through building a program.
 */

export function readRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function readArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

/** Trims, and returns null for anything blank — the columns are nullable. */
export function readString(value: unknown, maxLength?: number): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}
	return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/** Whole numbers only. `8.5` reps is not a rep count, so it is not one here. */
export function readInt(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export function readNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readBoolean(value: unknown, fallback = false): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

/**
 * @returns the value when it is one the database's enum will accept, else null.
 *   Postgres rejects an unknown enum label outright, so this is what stands
 *   between a renamed enum and a failed insert three levels into a tree.
 */
export function readEnum<T extends string>(
	value: unknown,
	allowed: readonly T[],
): T | null {
	return typeof value === 'string' &&
		(allowed as readonly string[]).includes(value)
		? (value as T)
		: null;
}

/**
 * Sorts by a numeric field and renumbers 1..n.
 *
 * Positions and set numbers must be contiguous from 1: the unique constraints
 * are on `(parent, position)`, and the app reads them as an order. A model that
 * emits 1, 3, 7 has expressed an order perfectly clearly — this is the cheapest
 * possible fix, and refusing the plan over it would be pedantry.
 */
export function renumber<T>(
	items: T[],
	orderBy: (item: T) => number | null,
): T[] {
	return [...items].sort((left, right) => {
		const a = orderBy(left);
		const b = orderBy(right);
		// Anything without a usable number sinks to the end rather than to the front,
		// where it would silently claim position 1.
		return (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER);
	});
}
