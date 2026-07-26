export enum FitnessGoal {
	FAT_LOSS = 'fat_loss',
	MUSCLE_GAIN = 'muscle_gain',
	RECOMPOSITION = 'recomposition',
	STRENGTH = 'strength',
	ENDURANCE = 'endurance',
	GENERAL_HEALTH = 'general_health',
	YOGA_MOBILITY = 'yoga_mobility',
}

export enum ActivityLevel {
	SEDENTARY = 'sedentary',
	LIGHTLY_ACTIVE = 'lightly_active',
	MODERATELY_ACTIVE = 'moderately_active',
	VERY_ACTIVE = 'very_active',
	ATHLETE = 'athlete',
}

export enum TrainingExperience {
	BEGINNER = 'beginner',
	INTERMEDIATE = 'intermediate',
	ADVANCED = 'advanced',
}

export enum EquipmentType {
	NONE = 'none',
	DUMBBELLS = 'dumbbells',
	BARBELL = 'barbell',
	KETTLEBELL = 'kettlebell',
	RESISTANCE_BANDS = 'resistance_bands',
	MACHINES = 'machines',
	FULL_GYM = 'full_gym',
}

export enum DietaryPreference {
	NONE = 'none',
	OMNIVORE = 'omnivore',
	HALAL = 'halal',
	KOSHER = 'kosher',
	VEGETARIAN = 'vegetarian',
	VEGAN = 'vegan',
	PESCATARIAN = 'pescatarian',
	GLUTEN_FREE = 'gluten_free',
	KETO = 'keto',
	LOW_CARB = 'low_carb',
	INTERMITTENT_FASTING = 'intermittent_fasting',
}

/** "What are you focused on?" — onboarding step 4. */
export enum FocusArea {
	STRENGTH = 'strength',
	YOGA = 'yoga',
	CARDIO = 'cardio',
	WEIGHT_LOSS = 'weight_loss',
	MOBILITY = 'mobility',
}

/** "Training style" preference — onboarding step 4. */
export enum TrainingStyle {
	STRENGTH = 'strength',
	HYPERTROPHY = 'hypertrophy',
	CARDIO = 'cardio',
	HIIT = 'hiit',
	MOBILITY = 'mobility',
	YOGA = 'yoga',
}
