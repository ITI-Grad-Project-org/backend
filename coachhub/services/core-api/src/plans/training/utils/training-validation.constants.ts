export const TRAINING_VALIDATION_LIMITS = {
	programDescriptionLength: 5_000,
	dayNotesLength: 5_000,
	coachNotesLength: 5_000,
	repetitions: 1_000,
	setDurationSeconds: 21_600,
	weightKg: 1_000,
	restSeconds: 3_600,
	exercisesPerDay: 30,
	setsPerExercise: 20,
	workoutDurationMinutes: 1_440,
	calendarRangeDays: 366,
	rpe: 10,
	rir: 10,
	percentOneRepMax: 100,
} as const;

export const EXERCISE_INSTRUCTION_LIMITS = {
	steps: 10,
	stepLength: 500,
	urlLength: 2_000,
} as const;

export const TEMPO_PATTERN = /^(?:\d|x)-(?:\d|x)-(?:\d|x)-(?:\d|x)$/i;
