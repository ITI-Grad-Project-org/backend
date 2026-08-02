import { MealSlot } from '../../common';

export const MAX_ACTIVITY_SOURCE_KEY_LENGTH = 160;

export function validateActivitySourceKey(sourceKey: string) {
	if (
		typeof sourceKey !== 'string' ||
		sourceKey.trim().length === 0 ||
		sourceKey.length > MAX_ACTIVITY_SOURCE_KEY_LENGTH
	) {
		throw new Error(
			`Activity source key must contain 1 to ${MAX_ACTIVITY_SOURCE_KEY_LENGTH} characters`,
		);
	}
}

function requireSourceId(sourceId: string, sourceName: string) {
	if (typeof sourceId !== 'string' || sourceId.trim().length === 0) {
		throw new Error(
			`${sourceName} is required to build an activity source key`,
		);
	}
}

export function buildLoggedSetActivitySourceKey(loggedSetId: string) {
	requireSourceId(loggedSetId, 'Logged set id');
	return `logged-set:${loggedSetId}`;
}

export function buildLoggedMealActivitySourceKey(loggedMealId: string) {
	requireSourceId(loggedMealId, 'Logged meal id');
	return `logged-meal:${loggedMealId}`;
}

export function buildFlexibleMealActivitySourceKey(
	nutritionDayLogId: string,
	mealSlot: MealSlot,
) {
	requireSourceId(nutritionDayLogId, 'Nutrition day log id');
	requireSourceId(mealSlot, 'Meal slot');
	return `nutrition-day-log:${nutritionDayLogId}:meal-slot:${mealSlot}`;
}
