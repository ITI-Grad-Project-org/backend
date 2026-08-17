import {
	ActivityLevel,
	DietaryPreference,
	EquipmentType,
	ExerciseCategory,
	FitnessGoal,
	FocusArea,
	Gender,
	MuscleGroup,
	ServingUnit,
	TrainingExperience,
	TrainingStyle,
} from '../../common';

/**
 * Shapes stored in the `jsonb` columns of `ai_plan_suggestions`, and the request
 * context assembled for the model.
 *
 * The snapshot is our own data, so it is typed precisely. The plan is not — the
 * model's output is untrusted until the validator has run, so giving it a
 * precise TypeScript type at the storage layer would claim a guarantee nothing
 * has made yet.
 */

/** One thing validation found wrong with, or worth saying about, a plan. */
export interface PlanSuggestionWarning {
	/** Stable machine code, e.g. `unknown_exercise`. */
	code: string;
	/**
	 * `error` blocks acceptance and forces the suggestion to `invalid`; `warning`
	 * leaves it acceptable and is shown to the coach. The line between them is
	 * whether the database would reject it or a human might merely disagree —
	 * training around an injury is a judgment call, a missing exercise is not.
	 */
	severity: 'error' | 'warning';
	/** Where in the plan, e.g. `week.days[2].exercises[0].sets[1]`. */
	path: string;
	/** Shown in the UI as written. */
	message: string;
}

/** The model's proposal, as parsed but before it means anything. */
export type SuggestedPlan = Record<string, unknown>;

/**
 * The client as the model saw them.
 *
 * Name and email are deliberately absent: designing a program needs a body and a
 * history, not an identity, and the cheapest way to keep a client's name out of
 * a third-party prompt log is to never put it in the prompt.
 */
export interface PlanClientProfile {
	/** Derived from the date of birth — the birth date itself is never sent. */
	ageYears: number | null;
	gender: Gender | null;
	heightCm: number | null;
	/** The most recently measured weight, falling back to the profile figure. */
	weightKg: number | null;
}

/** The coach-facing intake, minus the fields that only matter to onboarding. */
export interface PlanIntakeProfile {
	goal: FitnessGoal;
	activityLevel: ActivityLevel | null;
	trainingExperience: TrainingExperience;
	trainingDaysPerWeek: number | null;
	focusAreas: FocusArea[];
	trainingStyles: TrainingStyle[];
	availableEquipment: EquipmentType[];
	dietaryPreferences: DietaryPreference[];
	allergies: string[];
	medicalConditions: string[];
	injuries: string[];
	notes: string | null;
}

export interface PlanMeasurementPoint {
	measuredAt: string;
	weightKg: number | null;
	bodyFatPct: number | null;
	chestCm: number | null;
	waistCm: number | null;
	hipsCm: number | null;
	armCm: number | null;
	thighCm: number | null;
}

/** What the coach asked for, after intake fallbacks have been applied. */
export interface PlanConstraints {
	durationWeeks: number;
	/** Training only — null for a nutrition plan. */
	daysPerWeek: number | null;
	goal: FitnessGoal | null;
}

/**
 * How big the pool was that the model chose from.
 *
 * The candidates themselves are not stored: they are a mutable, tenant-owned
 * library, the chosen ids already appear in the plan, and acceptance re-checks
 * every id against the live tables anyway — so a stored copy would be a second
 * source of truth that is wrong the moment a coach edits an exercise. The counts
 * are kept because they answer the question the coach will actually ask: why so
 * few squat variations? Because the client owns dumbbells and a mat.
 */
export interface PlanLibraryDescriptor {
	counts: {
		exercises?: number;
		meals?: number;
		foods?: number;
	};
	/**
	 * Equipment the exercise pool was filtered to; empty means unfiltered. Only
	 * set for a training plan — it explains nothing about a meal.
	 */
	equipment: EquipmentType[];
	/**
	 * Allergens that removed meals and foods from the pool. Only set for a
	 * nutrition plan, and the other half of the same question: a library looks
	 * mysteriously small until you see what was filtered out of it.
	 */
	excludedAllergens: string[];
	/** True when a library was larger than one request may carry. */
	truncated: boolean;
}

/** What the client looked like when the plan was generated. */
export interface PlanInputSnapshot {
	client: PlanClientProfile;
	intake: PlanIntakeProfile | null;
	/** Newest first. */
	measurements: PlanMeasurementPoint[];
	constraints: PlanConstraints;
	library: PlanLibraryDescriptor;
	coachNotes: string | null;
}

/**
 * One row of the coach's exercise library, as offered to the model.
 *
 * Plan generation is a selection problem, not a generation problem:
 * `planned_exercises.exercise_id` is a NOT NULL foreign key, so an exercise the
 * model invents cannot be saved. It picks ids from this list or the plan is
 * rejected.
 */
export interface ExerciseCandidate {
	id: string;
	name: string;
	category: ExerciseCategory;
	primaryMuscle: MuscleGroup;
	secondaryMuscles: MuscleGroup[];
	equipment: EquipmentType[];
}

/** Macros are the rolled-up ingredient totals, not a stored column. */
export interface MealCandidate {
	id: string;
	name: string;
	dietaryTags: DietaryPreference[];
	/** The meal's own allergens plus every ingredient's. */
	allergens: string[];
	calories: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG: number | null;
}

export interface FoodCandidate {
	id: string;
	name: string;
	brand: string | null;
	servingSize: number;
	servingUnit: ServingUnit;
	calories: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG: number | null;
	dietaryTags: DietaryPreference[];
	allergens: string[];
}

/** Only the lists the requested kind needs are populated; the rest stay empty. */
export interface PlanCandidates {
	exercises: ExerciseCandidate[];
	meals: MealCandidate[];
	foods: FoodCandidate[];
}

/**
 * Everything one generation request needs: the half that is persisted and the
 * half that only travels on the event.
 */
export interface PlanGenerationContext {
	snapshot: PlanInputSnapshot;
	candidates: PlanCandidates;
}

/** Reported by ai-service on `ai.plan.completed`; kept for cost and latency review. */
export interface PlanModelMeta {
	model: string;
	finishReason: string | null;
	promptTokens: number | null;
	outputTokens: number | null;
	totalTokens: number | null;
	latencyMs: number | null;
}
