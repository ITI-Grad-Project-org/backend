import { BadRequestException } from '@nestjs/common';
import { DietaryPreference } from '../../../common';

export function assertActiveTenant(tenantId: string | null) {
	if (!tenantId) {
		throw new BadRequestException('No active tenant selected');
	}

	return tenantId;
}

export function normalizeFoodDisplayText(value: string) {
	return value.trim().replace(/\s+/g, ' '); // what does this regex do ?
}

export function normalizeNullableFoodDisplayText(value?: string | null) {
	if (value === undefined || value === null) return null;
	const normalized = normalizeFoodDisplayText(value);
	return normalized || null;
}

export function normalizeFoodLookupText(value?: string | null) {
	return normalizeNullableFoodDisplayText(value)?.toLocaleLowerCase() ?? '';
}

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
