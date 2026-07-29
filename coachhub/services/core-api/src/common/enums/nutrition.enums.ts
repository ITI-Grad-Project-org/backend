export enum MealSlot {
	BREAKFAST = 'breakfast',
	LUNCH = 'lunch',
	DINNER = 'dinner',
	SNACK = 'snack',
	PRE_WORKOUT = 'pre_workout',
	POST_WORKOUT = 'post_workout',
}

export enum ServingUnit {
	G = 'g',
	ML = 'ml',
	PIECE = 'piece',
	CUP = 'cup',
	TBSP = 'tbsp',
	SCOOP = 'scoop',
}

export enum NutritionPlanType {
	CLIENT = 'client',
	TEMPLATE = 'template',
}

export enum NutritionPlanStatus {
	DRAFT = 'draft',
	PUBLISHED = 'published',
	CANCELLED = 'cancelled',
}

export enum NutritionLogStatus {
	IN_PROGRESS = 'in_progress',
	FINALIZED = 'finalized',
}

export enum NutritionAdherenceOutcome {
	PENDING = 'pending',
	COMPLETED = 'completed',
	PARTIAL = 'partial',
	SKIPPED = 'skipped',
}
