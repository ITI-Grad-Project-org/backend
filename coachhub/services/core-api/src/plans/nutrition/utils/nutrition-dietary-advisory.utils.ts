import { ClientIntake } from '../../../clients/entities/client-intake.entity';
import { DietaryPreference } from '../../../common';
import { PlannedMeal } from '../entities/planned-meal.entity';

export type ClientDietaryProfile = Pick<
	ClientIntake,
	'dietaryPreferences' | 'allergies'
> | null;

const ADVISORY_NOTICE =
	'Dietary and allergen warnings are advisory and cannot guarantee medical safety.';

function normalizeComparisonText(value: string) {
	return value.trim().toLowerCase();
}

export function mapClientDietaryProfile(profile: ClientDietaryProfile) {
	return {
		dietaryPreferences: profile?.dietaryPreferences ?? [],
		allergies: profile?.allergies ?? [],
	};
}

export function buildDietaryAdvisoryWarnings(
	dayId: string,
	scheduledDate: string,
	meals: PlannedMeal[],
	profile: ClientDietaryProfile,
) {
	const dietaryPreferences = (profile?.dietaryPreferences ?? []).filter(
		(preference) => preference !== DietaryPreference.NONE,
	);
	const allergies = new Set(
		(profile?.allergies ?? [])
			.map(normalizeComparisonText)
			.filter((allergy) => allergy.length > 0),
	);
	const warnings: object[] = [];

	for (const meal of meals) {
		const tags = new Set(
			(meal.dietaryTags ?? []).map((tag) => normalizeComparisonText(tag)),
		);
		for (const preference of dietaryPreferences) {
			if (!tags.has(normalizeComparisonText(preference))) {
				warnings.push({
					type: 'dietary_preference_mismatch',
					dayId,
					scheduledDate,
					plannedMealId: meal.id,
					mealName: meal.mealName,
					preference,
					message: `${meal.mealName} is not tagged as ${preference}`,
					advisory: true,
				});
			}
		}

		for (const allergen of new Set(
			(meal.allergens ?? [])
				.map(normalizeComparisonText)
				.filter((value) => value.length > 0),
		)) {
			if (allergies.has(allergen)) {
				warnings.push({
					type: 'allergen_match',
					dayId,
					scheduledDate,
					plannedMealId: meal.id,
					mealName: meal.mealName,
					allergen,
					message: `${meal.mealName} contains the declared allergen ${allergen}`,
					advisory: true,
				});
			}
		}
	}

	return warnings;
}

export function getDietaryAdvisoryNotice() {
	return ADVISORY_NOTICE;
}
