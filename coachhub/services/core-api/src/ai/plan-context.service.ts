import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { ClientIntake } from '../clients/entities/client-intake.entity';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { EquipmentType, FitnessGoal, PlanSuggestionKind } from '../common';
import { Checkin } from '../checkins/entities/checkin.entity';
import { Exercise } from '../exercises/entities/exercise.entity';
import { LoggedWorkout } from '../plans/training/entities/logged-workout.entity';
import { Measurement } from '../measurements/entities/measurement.entity';
import { Food } from '../plans/nutrition/entities/food.entity';
import { Meal } from '../plans/nutrition/entities/meal.entity';
import { calculateMealTotals } from '../plans/nutrition/utils/meal-library.utils';
import {
	ExerciseCandidate,
	FoodCandidate,
	MealCandidate,
	PlanCandidates,
	PlanClientProfile,
	PlanConstraints,
	PlanCheckinNote,
	PlanGenerationContext,
	PlanIntakeProfile,
	PlanMeasurementPoint,
	PlanSessionNote,
	PlanTrainingHistory,
} from './types/plan-suggestion.types';

/** Measurements handed to the model, newest first — enough to show a trend. */
const MEASUREMENT_HISTORY = 6;

/**
 * Check-ins and sessions carried into the prompt, newest first.
 *
 * Enough to show a pattern — a knee mentioned three weeks running, a fortnight
 * of missed sessions — without spending the prompt budget on a year of history
 * the model would skim anyway.
 */
const CHECKIN_HISTORY = 6;
const SESSION_HISTORY = 10;

/**
 * Ceiling on rows read from one library table per request. A guard against a
 * pathological library, not an expected limit: a coach's library is normally in
 * the low hundreds.
 */
const LIBRARY_FETCH_LIMIT = 1_000;

/** Ceiling on candidates carried on one event, per type. */
const CANDIDATE_LIMIT = 300;

const DEFAULT_DURATION_WEEKS = 4;
const DEFAULT_DAYS_PER_WEEK = 3;

const EMPTY_CANDIDATES: PlanCandidates = {
	exercises: [],
	meals: [],
	foods: [],
};

export interface BuildPlanContextInput {
	tenantId: string;
	/** Must already be authorized — this service does no tenant checking. */
	membership: ClientMembership;
	kind: PlanSuggestionKind;
	/** Straight from the request; intake fallbacks are applied here. */
	requested: {
		durationWeeks?: number;
		daysPerWeek?: number;
		goal?: FitnessGoal;
	};
	coachNotes: string | null;
}

@Injectable()
export class PlanContextService {
	constructor(
		@InjectRepository(ClientIntake)
		private readonly intakeRepository: Repository<ClientIntake>,
		@InjectRepository(Measurement)
		private readonly measurementRepository: Repository<Measurement>,
		@InjectRepository(Exercise)
		private readonly exerciseRepository: Repository<Exercise>,
		@InjectRepository(Checkin)
		private readonly checkinRepository: Repository<Checkin>,
		@InjectRepository(LoggedWorkout)
		private readonly loggedWorkoutRepository: Repository<LoggedWorkout>,
		@InjectRepository(Meal)
		private readonly mealRepository: Repository<Meal>,
		@InjectRepository(Food)
		private readonly foodRepository: Repository<Food>,
	) {}

	async build(input: BuildPlanContextInput): Promise<PlanGenerationContext> {
		const [intakeRow, measurementRows, history] = await Promise.all([
			this.findIntake(input.tenantId, input.membership.id),
			this.findMeasurements(input.tenantId, input.membership.id),
			this.findHistory(input.tenantId, input.membership.id),
		]);

		const intake = intakeRow ? this.toIntakeProfile(intakeRow) : null;
		const measurements = measurementRows.map((row) =>
			this.toMeasurementPoint(row),
		);
		const isTraining = input.kind === PlanSuggestionKind.TRAINING;
		const equipment = isTraining
			? this.resolveEquipment(intake?.availableEquipment ?? [])
			: [];
		const allergies = isTraining ? [] : (intake?.allergies ?? []);
		const { candidates, truncated } = await this.findCandidates(
			input.tenantId,
			input.kind,
			equipment,
			allergies,
		);

		return {
			snapshot: {
				client: this.toClientProfile(input.membership, measurements),
				intake,
				measurements,
				history,
				constraints: this.resolveConstraints(input, intake),
				library: {
					counts: isTraining
						? { exercises: candidates.exercises.length }
						: {
								meals: candidates.meals.length,
								foods: candidates.foods.length,
							},
					equipment,
					excludedAllergens: [...this.allergenKeys(allergies)],
					truncated,
				},
				coachNotes: input.coachNotes,
			},
			candidates,
		};
	}

	private findIntake(tenantId: string, membershipId: string) {
		return this.intakeRepository.findOne({
			where: {
				tenant: { id: tenantId },
				membership: { id: membershipId },
			},
		});
	}

	/**
	 * What has actually happened since the last plan.
	 *
	 * Read straight from Postgres rather than through the knowledge base, for the
	 * same reason the exercise library is. This has to be *this client's* history
	 * and all of it: vector retrieval is scoped by tenant, so a similarity search
	 * could surface another client's check-in — and "the six most similar notes"
	 * is the wrong shape for a question whose answer is "the six most recent".
	 */
	private async findHistory(
		tenantId: string,
		membershipId: string,
	): Promise<PlanTrainingHistory> {
		const [checkins, sessions] = await Promise.all([
			// Only rows with something written on them. A pending check-in is a
			// scheduling artefact, not feedback, and empty weeks in the prompt cost
			// tokens while diluting the signal.
			this.checkinRepository.find({
				where: [
					{ tenantId, membershipId, clientNotes: Not(IsNull()) },
					{ tenantId, membershipId, coachFeedback: Not(IsNull()) },
				],
				order: { scheduledFor: 'DESC' },
				take: CHECKIN_HISTORY,
			}),
			this.loggedWorkoutRepository.find({
				where: [
					{ tenantId, membershipId, clientNotes: Not(IsNull()) },
					{ tenantId, membershipId, overallRpe: Not(IsNull()) },
				],
				order: { scheduledDate: 'DESC' },
				take: SESSION_HISTORY,
			}),
		]);

		return {
			checkins: checkins.map(
				(row): PlanCheckinNote => ({
					date: row.scheduledFor,
					clientNotes: row.clientNotes,
					coachFeedback: row.coachFeedback,
					metrics: row.metrics,
				}),
			),
			sessions: sessions.map(
				(row): PlanSessionNote => ({
					date: row.scheduledDate,
					clientNotes: row.clientNotes,
					overallRpe: row.overallRpe,
					durationMinutes: row.durationMinutes,
					completed: row.completedAt !== null,
				}),
			),
		};
	}

	private findMeasurements(tenantId: string, membershipId: string) {
		return this.measurementRepository.find({
			where: { tenantId, membershipId },
			order: { measuredAt: 'DESC' },
			take: MEASUREMENT_HISTORY,
		});
	}

	private toClientProfile(
		membership: ClientMembership,
		measurements: PlanMeasurementPoint[],
	): PlanClientProfile {
		const client = membership.client;
		return {
			ageYears: this.ageFrom(client?.dateOfBirth ?? null),
			gender: client?.gender ?? null,
			// The profile weight is whatever the client typed at signup; a logged
			// measurement is what they weighed. Prefer the most recent one that was
			// actually recorded — a measurement row may carry photos and no weight.
			weightKg:
				measurements.find((point) => point.weightKg !== null)?.weightKg ??
				client?.weightKg ??
				null,
			heightCm: client?.heightCm ?? null,
		};
	}

	private toIntakeProfile(intake: ClientIntake): PlanIntakeProfile {
		return {
			goal: intake.goal,
			activityLevel: intake.activityLevel,
			trainingExperience: intake.trainingExperience,
			trainingDaysPerWeek: intake.trainingDaysPerWeek,
			focusAreas: intake.focusAreas ?? [],
			trainingStyles: intake.trainingStyles ?? [],
			availableEquipment: intake.availableEquipment ?? [],
			dietaryPreferences: intake.dietaryPreferences ?? [],
			allergies: intake.allergies ?? [],
			medicalConditions: intake.medicalConditions ?? [],
			injuries: intake.injuries ?? [],
			notes: intake.notes,
		};
	}

	private toMeasurementPoint(measurement: Measurement): PlanMeasurementPoint {
		return {
			measuredAt: measurement.measuredAt,
			weightKg: measurement.weightKg,
			bodyFatPct: measurement.bodyFatPct,
			chestCm: measurement.chestCm,
			waistCm: measurement.waistCm,
			hipsCm: measurement.hipsCm,
			armCm: measurement.armCm,
			thighCm: measurement.thighCm,
		};
	}

	private resolveConstraints(
		input: BuildPlanContextInput,
		intake: PlanIntakeProfile | null,
	): PlanConstraints {
		return {
			durationWeeks: input.requested.durationWeeks ?? DEFAULT_DURATION_WEEKS,
			daysPerWeek:
				input.kind === PlanSuggestionKind.TRAINING
					? (input.requested.daysPerWeek ??
						intake?.trainingDaysPerWeek ??
						DEFAULT_DAYS_PER_WEEK)
					: null,
			goal: input.requested.goal ?? intake?.goal ?? null,
		};
	}

	private resolveEquipment(available: EquipmentType[]): EquipmentType[] {
		if (available.length === 0) {
			return [];
		}
		if (available.includes(EquipmentType.FULL_GYM)) {
			return Object.values(EquipmentType);
		}
		return [...new Set([...available, EquipmentType.NONE])];
	}

	private async findCandidates(
		tenantId: string,
		kind: PlanSuggestionKind,
		equipment: EquipmentType[],
		allergies: string[],
	): Promise<{ candidates: PlanCandidates; truncated: boolean }> {
		if (kind === PlanSuggestionKind.TRAINING) {
			const exercises = await this.findExercises(tenantId, equipment);
			return {
				candidates: { ...EMPTY_CANDIDATES, exercises: exercises.rows },
				truncated: exercises.truncated,
			};
		}

		const [meals, foods] = await Promise.all([
			this.findMeals(tenantId, allergies),
			this.findFoods(tenantId, allergies),
		]);
		return {
			candidates: { ...EMPTY_CANDIDATES, meals: meals.rows, foods: foods.rows },
			truncated: meals.truncated || foods.truncated,
		};
	}

	private async findExercises(tenantId: string, equipment: EquipmentType[]) {
		const rows = await this.exerciseRepository.find({
			where: { tenantId, isActive: true },
			order: { name: 'ASC' },
			take: LIBRARY_FETCH_LIMIT,
		});
		const allowed = new Set(equipment);
		const performable = rows.filter((row) =>
			this.isPerformable(row.equipment ?? [], allowed),
		);

		return this.cap(
			performable.map(
				(row): ExerciseCandidate => this.toExerciseCandidate(row),
			),
			rows.length,
		);
	}

	private async findMeals(tenantId: string, allergies: string[]) {
		const rows = await this.mealRepository.find({
			where: { tenantId, isActive: true },
			relations: { ingredients: { food: true } },
			order: { name: 'ASC' },
			take: LIBRARY_FETCH_LIMIT,
		});
		const blocked = this.allergenKeys(allergies);
		const candidates = rows
			.map((row) => this.toMealCandidate(row))
			.filter((candidate) => !this.hasAllergen(candidate.allergens, blocked));

		return this.cap(candidates, rows.length);
	}

	private async findFoods(tenantId: string, allergies: string[]) {
		const rows = await this.foodRepository.find({
			where: { tenantId, isActive: true },
			order: { name: 'ASC' },
			take: LIBRARY_FETCH_LIMIT,
		});
		const blocked = this.allergenKeys(allergies);
		const candidates = rows
			.filter((row) => !this.hasAllergen(row.allergens ?? [], blocked))
			.map((row): FoodCandidate => this.toFoodCandidate(row));

		return this.cap(candidates, rows.length);
	}

	private toExerciseCandidate(exercise: Exercise): ExerciseCandidate {
		return {
			id: exercise.id,
			name: exercise.name,
			category: exercise.category,
			primaryMuscle: exercise.primaryMuscle,
			secondaryMuscles: exercise.secondaryMuscles ?? [],
			equipment: exercise.equipment ?? [],
		};
	}

	private toMealCandidate(meal: Meal): MealCandidate {
		const ingredients = meal.ingredients ?? [];
		const totals = calculateMealTotals(ingredients);
		return {
			id: meal.id,
			name: meal.name,
			dietaryTags: meal.dietaryTags ?? [],
			// A meal is as allergenic as its ingredients, and `meals.allergens` only
			// holds what the coach added on top (a sauce, a garnish).
			allergens: [
				...new Set([
					...(meal.allergens ?? []),
					...ingredients.flatMap((item) => item.food?.allergens ?? []),
				]),
			],
			calories: totals.calories,
			proteinG: totals.proteinG,
			carbsG: totals.carbsG,
			fatG: totals.fatG,
			fiberG: totals.fiberG,
		};
	}

	private toFoodCandidate(food: Food): FoodCandidate {
		return {
			id: food.id,
			name: food.name,
			brand: food.brand,
			servingSize: food.servingSize,
			servingUnit: food.servingUnit,
			calories: food.calories,
			proteinG: food.proteinG,
			carbsG: food.carbsG,
			fatG: food.fatG,
			fiberG: food.fiberG,
			dietaryTags: food.dietaryTags ?? [],
			allergens: food.allergens ?? [],
		};
	}

	/**
	 * An exercise is performable when the client has everything it needs — not
	 * merely one of the things. Containment, not overlap: a barbell hip thrust
	 * tagged `{barbell, machines}` is no use to someone who only owns a bench.
	 *
	 * An exercise that lists no equipment is bodyweight and always passes, which
	 * falls out of `every` on an empty array without a special case.
	 */
	private isPerformable(
		required: EquipmentType[],
		allowed: Set<EquipmentType>,
	): boolean {
		if (allowed.size === 0) {
			return true;
		}
		return required.every((item) => allowed.has(item));
	}

	/**
	 * Normalises a client's stated allergies for matching.
	 *
	 * Coaches type these into an intake box, so what arrives is prose — "Alergic to
	 * lactose", not "milk". Lower-casing and trimming is only the first half of the
	 * job; see {@link hasAllergen} for why an exact comparison is not enough.
	 */
	private allergenKeys(values: string[]): Set<string> {
		return new Set(
			values
				.map((value) => value.trim().toLowerCase())
				.filter((value) => value.length > 0),
		);
	}

	/**
	 * True when a food's allergen tag is named anywhere in what the client wrote.
	 *
	 * <h3>Why this is not an exact comparison</h3>
	 *
	 * Foods carry single-word tags — `milk`, `peanuts`, `gluten`. Clients write
	 * sentences. A real intake in this database says "Alergic to lactose", and an
	 * exact match against `milk` finds nothing, so every dairy meal stayed in the
	 * candidate pool for a client who cannot digest dairy.
	 *
	 * Matching on whole words inside the phrase closes that, and it fails in the
	 * safe direction: a spurious match removes a meal the client could have eaten,
	 * a missed one offers a meal that could hurt them. Those are not the same
	 * mistake, so the comparison is deliberately generous.
	 *
	 * <h3>What this still does not solve</h3>
	 *
	 * It only works when the client's words and the food's tag share a term. The
	 * durable fix is a controlled allergen list at intake rather than free text —
	 * until then, seed tags carry their common synonyms so there is more to hit.
	 */
	private hasAllergen(allergens: string[], blocked: Set<string>): boolean {
		if (blocked.size === 0) {
			return false;
		}
		return allergens.some((allergen) => {
			const tag = allergen.trim().toLowerCase();
			if (!tag) {
				return false;
			}
			return [...blocked].some(
				(stated) =>
					stated === tag ||
					this.mentions(stated, tag) ||
					this.mentions(tag, stated),
			);
		});
	}

	/** Whole-word containment, so "nuts" does not match inside "coconut". */
	private mentions(phrase: string, term: string): boolean {
		const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(phrase);
	}

	private cap<T>(candidates: T[], fetched: number) {
		return {
			rows: candidates.slice(0, CANDIDATE_LIMIT),
			truncated:
				candidates.length > CANDIDATE_LIMIT || fetched === LIBRARY_FETCH_LIMIT,
		};
	}

	/** Whole years, counting the birthday as the day it turns over. */
	private ageFrom(dateOfBirth: string | null): number | null {
		if (!dateOfBirth) {
			return null;
		}
		const born = new Date(dateOfBirth);
		if (Number.isNaN(born.getTime())) {
			return null;
		}
		const now = new Date();
		let age = now.getUTCFullYear() - born.getUTCFullYear();
		const monthDelta = now.getUTCMonth() - born.getUTCMonth();
		if (
			monthDelta < 0 ||
			(monthDelta === 0 && now.getUTCDate() < born.getUTCDate())
		) {
			age -= 1;
		}
		return age >= 0 ? age : null;
	}
}
