export enum ExerciseCategory {
	STRENGTH = 'strength',
	CARDIO = 'cardio',
	MOBILITY = 'mobility',
	PLYOMETRIC = 'plyometric',
	CORE = 'core',
}

export enum MuscleGroup {
	CHEST = 'chest',
	BACK = 'back',
	SHOULDERS = 'shoulders',
	BICEPS = 'biceps',
	TRICEPS = 'triceps',
	FOREARMS = 'forearms',
	QUADS = 'quads',
	HAMSTRINGS = 'hamstrings',
	GLUTES = 'glutes',
	CALVES = 'calves',
	CORE = 'core',
	FULL_BODY = 'full_body',
}

export enum DifficultyLevel {
	BEGINNER = 'beginner',
	INTERMEDIATE = 'intermediate',
	ADVANCED = 'advanced',
}

export enum SetType {
	WORKING = 'working',
	WARMUP = 'warmup',
	DROP_SET = 'drop_set',
	AMRAP = 'amrap',
	TO_FAILURE = 'to_failure',
}

export enum IntensityType {
	RPE = 'rpe',
	RIR = 'rir',
	PERCENT_1RM = 'percent_1rm',
}

export enum AssignmentStatus {
	SCHEDULED = 'scheduled',
	ACTIVE = 'active',
	COMPLETED = 'completed',
	CANCELLED = 'cancelled',
}

export enum SessionStatus {
	COMPLETED = 'completed',
	PARTIAL = 'partial',
	SKIPPED = 'skipped',
}
