import { BadRequestException } from '@nestjs/common';
import { DietaryPreference } from '../../../common';

export function assertActiveTenant(tenantId: string | null) {
	if (!tenantId) {
		throw new BadRequestException('No active tenant selected');
	}

	return tenantId;
}

export function normalizeFoodDisplayText(value: string) {
	return value.trim().replace(/\s+/g, ' ');
}

export function normalizeNullableFoodDisplayText(value?: string | null) {
	if (value === undefined || value === null) return null;
	const normalized = normalizeFoodDisplayText(value);
	return normalized || null;
}

export function normalizeFoodLookupText(value?: string | null) {
	return normalizeNullableFoodDisplayText(value)?.toLocaleLowerCase() ?? '';
}

/** Escapes PostgreSQL LIKE control characters for a literal substring search. */
// Compatibility re-export: this moved to common/utils so the clients feature can
// use it without importing from nutrition.
export { escapePostgresLikePattern } from '../../../common/utils/sql-pattern.utils';

export function normalizeFoodDietaryTags(tags?: DietaryPreference[]) {
	return [...new Set(tags ?? [])];
}

export function normalizeFoodAllergens(allergens?: string[]) {
	return [
		...new Set(
			(allergens ?? []).map((allergen) => normalizeFoodLookupText(allergen)),
		),
	].filter(Boolean);
}
