import { Repository } from 'typeorm';
import { ClientIntake } from '../clients/entities/client-intake.entity';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import {
	ActivityLevel,
	EquipmentType,
	ExerciseCategory,
	FitnessGoal,
	Gender,
	MuscleGroup,
	PlanSuggestionKind,
	ServingUnit,
	TrainingExperience,
} from '../common';
import { Checkin } from '../checkins/entities/checkin.entity';
import { Exercise } from '../exercises/entities/exercise.entity';
import { LoggedWorkout } from '../plans/training/entities/logged-workout.entity';
import { Measurement } from '../measurements/entities/measurement.entity';
import { Food } from '../plans/nutrition/entities/food.entity';
import { Meal } from '../plans/nutrition/entities/meal.entity';
import {
	BuildPlanContextInput,
	PlanContextService,
} from './plan-context.service';

const TENANT = 'tenant-1';

function membership(client: Partial<ClientMembership['client']> = {}) {
	return {
		id: 'membership-1',
		client: {
			id: 'client-1',
			dateOfBirth: null,
			gender: null,
			heightCm: null,
			weightKg: null,
			...client,
		},
	} as unknown as ClientMembership;
}

function intake(overrides: Partial<ClientIntake> = {}): ClientIntake {
	return {
		goal: FitnessGoal.MUSCLE_GAIN,
		activityLevel: ActivityLevel.MODERATELY_ACTIVE,
		trainingExperience: TrainingExperience.INTERMEDIATE,
		trainingDaysPerWeek: 4,
		focusAreas: [],
		trainingStyles: [],
		availableEquipment: [],
		dietaryPreferences: [],
		allergies: null,
		medicalConditions: null,
		injuries: null,
		notes: null,
		...overrides,
	} as unknown as ClientIntake;
}

function exercise(
	name: string,
	equipment: EquipmentType[],
	overrides: Partial<Exercise> = {},
): Exercise {
	return {
		id: `exercise-${name}`,
		name,
		category: ExerciseCategory.STRENGTH,
		primaryMuscle: MuscleGroup.CHEST,
		secondaryMuscles: [],
		equipment,
		...overrides,
	} as unknown as Exercise;
}

function food(name: string, allergens: string[] = []): Food {
	return {
		id: `food-${name}`,
		name,
		brand: null,
		servingSize: 100,
		servingUnit: ServingUnit.G,
		calories: 200,
		proteinG: 20,
		carbsG: 10,
		fatG: 5,
		fiberG: 2,
		dietaryTags: [],
		allergens,
	} as unknown as Food;
}

function meal(
	name: string,
	ingredientFoods: Food[],
	ownAllergens: string[] = [],
): Meal {
	return {
		id: `meal-${name}`,
		name,
		dietaryTags: [],
		allergens: ownAllergens,
		ingredients: ingredientFoods.map((item, index) => ({
			position: index + 1,
			amount: 100,
			food: item,
		})),
	} as unknown as Meal;
}

function measurement(overrides: Partial<Measurement> = {}): Measurement {
	return {
		measuredAt: '2026-08-01',
		weightKg: null,
		bodyFatPct: null,
		chestCm: null,
		waistCm: null,
		hipsCm: null,
		armCm: null,
		thighCm: null,
		...overrides,
	} as unknown as Measurement;
}

describe('PlanContextService', () => {
	let intakeRepository: { findOne: jest.Mock };
	let measurementRepository: { find: jest.Mock };
	let exerciseRepository: { find: jest.Mock };
	let mealRepository: { find: jest.Mock };
	let foodRepository: { find: jest.Mock };
	let checkinRepository: { find: jest.Mock };
	let loggedWorkoutRepository: { find: jest.Mock };
	let service: PlanContextService;

	beforeEach(() => {
		intakeRepository = { findOne: jest.fn().mockResolvedValue(null) };
		measurementRepository = { find: jest.fn().mockResolvedValue([]) };
		exerciseRepository = { find: jest.fn().mockResolvedValue([]) };
		mealRepository = { find: jest.fn().mockResolvedValue([]) };
		foodRepository = { find: jest.fn().mockResolvedValue([]) };
		checkinRepository = { find: jest.fn().mockResolvedValue([]) };
		loggedWorkoutRepository = { find: jest.fn().mockResolvedValue([]) };

		service = new PlanContextService(
			intakeRepository as unknown as Repository<ClientIntake>,
			measurementRepository as unknown as Repository<Measurement>,
			exerciseRepository as unknown as Repository<Exercise>,
			checkinRepository as unknown as Repository<Checkin>,
			loggedWorkoutRepository as unknown as Repository<LoggedWorkout>,
			mealRepository as unknown as Repository<Meal>,
			foodRepository as unknown as Repository<Food>,
		);
	});

	function build(overrides: Partial<BuildPlanContextInput> = {}) {
		return service.build({
			tenantId: TENANT,
			membership: membership(),
			kind: PlanSuggestionKind.TRAINING,
			requested: {},
			coachNotes: null,
			...overrides,
		});
	}

	describe('exercise candidates', () => {
		it('keeps only exercises the client owns every piece of kit for', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ availableEquipment: [EquipmentType.BARBELL] }),
			);
			exerciseRepository.find.mockResolvedValue([
				exercise('Barbell Row', [EquipmentType.BARBELL]),
				exercise('Cable Hip Thrust', [
					EquipmentType.BARBELL,
					EquipmentType.MACHINES,
				]),
			]);

			const { candidates } = await build();

			expect(candidates.exercises.map((row) => row.name)).toEqual([
				'Barbell Row',
			]);
		});

		it('always offers bodyweight exercises, which list no equipment', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ availableEquipment: [EquipmentType.DUMBBELLS] }),
			);
			exerciseRepository.find.mockResolvedValue([
				exercise('Push-up', []),
				exercise('Barbell Squat', [EquipmentType.BARBELL]),
			]);

			const { candidates } = await build();

			expect(candidates.exercises.map((row) => row.name)).toEqual(['Push-up']);
		});

		it('treats a full gym as every kind of equipment', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ availableEquipment: [EquipmentType.FULL_GYM] }),
			);
			exerciseRepository.find.mockResolvedValue([
				exercise('Barbell Squat', [EquipmentType.BARBELL]),
				exercise('Band Pull-apart', [EquipmentType.RESISTANCE_BANDS]),
			]);

			const { candidates, snapshot } = await build();

			expect(candidates.exercises).toHaveLength(2);
			expect(snapshot.library.equipment).toEqual(
				expect.arrayContaining([
					EquipmentType.BARBELL,
					EquipmentType.RESISTANCE_BANDS,
				]),
			);
		});

		it('does not filter at all when the intake never recorded equipment', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ availableEquipment: [] }),
			);
			exerciseRepository.find.mockResolvedValue([
				exercise('Barbell Squat', [EquipmentType.BARBELL]),
				exercise('Machine Press', [EquipmentType.MACHINES]),
			]);

			const { candidates, snapshot } = await build();

			expect(candidates.exercises).toHaveLength(2);
			expect(snapshot.library.equipment).toEqual([]);
		});

		it('reports how big the pool was, and flags an oversized library', async () => {
			intakeRepository.findOne.mockResolvedValue(intake());
			exerciseRepository.find.mockResolvedValue(
				Array.from({ length: 305 }, (_, index) =>
					exercise(`Exercise ${index}`, []),
				),
			);

			const { candidates, snapshot } = await build();

			expect(candidates.exercises).toHaveLength(300);
			expect(snapshot.library.counts).toEqual({ exercises: 300 });
			expect(snapshot.library.truncated).toBe(true);
		});

		it('leaves the nutrition lists empty for a training request', async () => {
			exerciseRepository.find.mockResolvedValue([exercise('Push-up', [])]);

			const { candidates } = await build();

			expect(candidates.meals).toEqual([]);
			expect(candidates.foods).toEqual([]);
			expect(mealRepository.find).not.toHaveBeenCalled();
			expect(foodRepository.find).not.toHaveBeenCalled();
		});

		it('does not claim an allergen filter ran on an exercise library', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ allergies: ['peanuts'] }),
			);

			const { snapshot } = await build();

			expect(snapshot.library.excludedAllergens).toEqual([]);
		});
	});

	describe('nutrition candidates', () => {
		const nutrition = { kind: PlanSuggestionKind.NUTRITION };

		it('drops foods the client is allergic to, ignoring case and spacing', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ allergies: ['  Peanuts '] }),
			);
			foodRepository.find.mockResolvedValue([
				food('Peanut Butter', ['peanuts']),
				food('Oats', ['gluten']),
			]);

			const { candidates } = await build(nutrition);

			expect(candidates.foods.map((row) => row.name)).toEqual(['Oats']);
		});

		it('drops a meal whose ingredient carries the allergen', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ allergies: ['peanuts'] }),
			);
			mealRepository.find.mockResolvedValue([
				meal('Satay Bowl', [food('Peanut Sauce', ['Peanuts'])]),
				meal('Oat Bowl', [food('Oats', [])]),
			]);

			const { candidates } = await build(nutrition);

			expect(candidates.meals.map((row) => row.name)).toEqual(['Oat Bowl']);
		});

		it('rolls ingredient macros up into the meal', async () => {
			mealRepository.find.mockResolvedValue([
				meal('Double Oats', [food('Oats'), food('Oats2')]),
			]);

			const { candidates } = await build(nutrition);

			expect(candidates.meals[0]).toMatchObject({
				calories: 400,
				proteinG: 40,
				carbsG: 20,
				fatG: 10,
				fiberG: 4,
			});
		});

		it('counts meals and foods separately and skips the exercise library', async () => {
			mealRepository.find.mockResolvedValue([meal('Oat Bowl', [food('Oats')])]);
			foodRepository.find.mockResolvedValue([food('Oats'), food('Rice')]);

			const { snapshot } = await build(nutrition);

			expect(snapshot.library.counts).toEqual({ meals: 1, foods: 2 });
			expect(exerciseRepository.find).not.toHaveBeenCalled();
		});

		// A real intake in this database says "Alergic to lactose". Exact matching
		// against the tag `milk` found nothing, and every dairy meal stayed in the
		// pool for a client who cannot digest dairy.
		it('matches an allergen named inside a sentence the client typed', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ allergies: ['Alergic to lactose'] }),
			);
			foodRepository.find.mockResolvedValue([
				food('Greek Yogurt', ['milk', 'lactose']),
				food('Oats', ['gluten']),
			]);

			const { candidates } = await build(nutrition);

			expect(candidates.foods.map((row) => row.name)).toEqual(['Oats']);
		});

		it('matches when the client is terser than the tag', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ allergies: ['peanuts'] }),
			);
			foodRepository.find.mockResolvedValue([
				food('Satay', ['roasted peanuts']),
				food('Oats', []),
			]);

			const { candidates } = await build(nutrition);

			expect(candidates.foods.map((row) => row.name)).toEqual(['Oats']);
		});

		// Whole words only. Excluding coconut from a nut allergy would be a
		// different kind of wrong, and one the coach would have to unpick by hand.
		it('does not match a tag buried inside a longer word', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ allergies: ['nut'] }),
			);
			foodRepository.find.mockResolvedValue([
				food('Coconut Milk', ['coconut']),
			]);

			const { candidates } = await build(nutrition);

			expect(candidates.foods.map((row) => row.name)).toEqual(['Coconut Milk']);
		});

		it('records the allergens that shrank the library, and no equipment', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({
					allergies: ['  Peanuts ', 'Shellfish'],
					availableEquipment: [EquipmentType.DUMBBELLS],
				}),
			);

			const { snapshot } = await build(nutrition);

			expect(snapshot.library.excludedAllergens).toEqual([
				'peanuts',
				'shellfish',
			]);
			expect(snapshot.library.equipment).toEqual([]);
		});
	});

	describe('client profile', () => {
		it('prefers the most recently measured weight over the profile figure', async () => {
			measurementRepository.find.mockResolvedValue([
				measurement({ measuredAt: '2026-08-10', weightKg: 79.4 }),
				measurement({ measuredAt: '2026-07-10', weightKg: 82 }),
			]);

			const { snapshot } = await build({
				membership: membership({ weightKg: 95 } as never),
			});

			expect(snapshot.client.weightKg).toBe(79.4);
		});

		it('skips measurements that recorded no weight', async () => {
			measurementRepository.find.mockResolvedValue([
				measurement({ measuredAt: '2026-08-10', weightKg: null }),
				measurement({ measuredAt: '2026-07-10', weightKg: 82 }),
			]);

			const { snapshot } = await build();

			expect(snapshot.client.weightKg).toBe(82);
		});

		it('falls back to the profile weight when nothing was ever measured', async () => {
			const { snapshot } = await build({
				membership: membership({ weightKg: 95 } as never),
			});

			expect(snapshot.client.weightKg).toBe(95);
		});

		it('sends an age, never the date of birth', async () => {
			const born = new Date();
			born.setUTCFullYear(born.getUTCFullYear() - 30);

			const { snapshot } = await build({
				membership: membership({
					dateOfBirth: born.toISOString().slice(0, 10),
					gender: Gender.MALE,
				} as never),
			});

			expect(snapshot.client.ageYears).toBe(30);
			expect(JSON.stringify(snapshot)).not.toContain('dateOfBirth');
		});

		it('leaves age null when no birth date is on file', async () => {
			const { snapshot } = await build();

			expect(snapshot.client.ageYears).toBeNull();
		});
	});

	describe('constraints', () => {
		it('falls back to the intake for days per week and goal', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ trainingDaysPerWeek: 5, goal: FitnessGoal.STRENGTH }),
			);

			const { snapshot } = await build();

			expect(snapshot.constraints).toEqual({
				durationWeeks: 4,
				daysPerWeek: 5,
				goal: FitnessGoal.STRENGTH,
			});
		});

		it('lets the request override the intake', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ trainingDaysPerWeek: 5, goal: FitnessGoal.STRENGTH }),
			);

			const { snapshot } = await build({
				requested: {
					durationWeeks: 12,
					daysPerWeek: 3,
					goal: FitnessGoal.FAT_LOSS,
				},
			});

			expect(snapshot.constraints).toEqual({
				durationWeeks: 12,
				daysPerWeek: 3,
				goal: FitnessGoal.FAT_LOSS,
			});
		});

		it('has no days per week for a nutrition plan', async () => {
			intakeRepository.findOne.mockResolvedValue(
				intake({ trainingDaysPerWeek: 5 }),
			);

			const { snapshot } = await build({ kind: PlanSuggestionKind.NUTRITION });

			expect(snapshot.constraints.daysPerWeek).toBeNull();
		});

		it('works for a client who never completed an intake', async () => {
			const { snapshot } = await build();

			expect(snapshot.intake).toBeNull();
			expect(snapshot.constraints).toEqual({
				durationWeeks: 4,
				daysPerWeek: 3,
				goal: null,
			});
		});
	});

	describe('training history', () => {
		function checkin(overrides: Record<string, unknown> = {}) {
			return {
				scheduledFor: '2026-08-10',
				clientNotes: 'Knee felt tight on squats again.',
				coachFeedback: null,
				metrics: null,
				...overrides,
			};
		}

		function session(overrides: Record<string, unknown> = {}) {
			return {
				scheduledDate: '2026-08-12',
				clientNotes: 'Last set felt heavy.',
				overallRpe: 9,
				durationMinutes: 62,
				completedAt: new Date('2026-08-12T18:00:00.000Z'),
				...overrides,
			};
		}

		it('carries what the client wrote and how the sessions went', async () => {
			checkinRepository.find.mockResolvedValue([checkin()]);
			loggedWorkoutRepository.find.mockResolvedValue([session()]);

			const { snapshot } = await build();

			expect(snapshot.history.checkins).toEqual([
				{
					date: '2026-08-10',
					clientNotes: 'Knee felt tight on squats again.',
					coachFeedback: null,
					metrics: null,
				},
			]);
			expect(snapshot.history.sessions).toEqual([
				{
					date: '2026-08-12',
					clientNotes: 'Last set felt heavy.',
					overallRpe: 9,
					durationMinutes: 62,
					completed: true,
				},
			]);
		});

		it('marks a session that was started but never finished', async () => {
			loggedWorkoutRepository.find.mockResolvedValue([
				session({ completedAt: null }),
			]);

			const { snapshot } = await build();

			expect(snapshot.history.sessions[0].completed).toBe(false);
		});

		// A pending check-in is a scheduling artefact, not feedback. Asking the
		// database for only the rows carrying text keeps empty weeks out of the
		// prompt, where they would cost tokens and dilute the signal.
		it('asks only for rows that actually say something', async () => {
			await build();

			expect(checkinRepository.find).toHaveBeenCalledWith(
				expect.objectContaining({
					where: [
						expect.objectContaining({ clientNotes: expect.anything() }),
						expect.objectContaining({ coachFeedback: expect.anything() }),
					],
					order: { scheduledFor: 'DESC' },
					take: 6,
				}),
			);
			expect(loggedWorkoutRepository.find).toHaveBeenCalledWith(
				expect.objectContaining({
					order: { scheduledDate: 'DESC' },
					take: 10,
				}),
			);
		});

		it('scopes history to this membership, never the whole tenant', async () => {
			await build();

			for (const call of [
				checkinRepository.find.mock.calls[0][0],
				loggedWorkoutRepository.find.mock.calls[0][0],
			]) {
				for (const clause of call.where) {
					expect(clause).toMatchObject({
						tenantId: TENANT,
						membershipId: 'membership-1',
					});
				}
			}
		});

		it('is empty for a client who has never checked in or logged a session', async () => {
			const { snapshot } = await build();

			expect(snapshot.history).toEqual({ checkins: [], sessions: [] });
		});

		it('collects history for a nutrition plan too', async () => {
			checkinRepository.find.mockResolvedValue([
				checkin({ clientNotes: 'Hungry all week on the current calories.' }),
			]);

			const { snapshot } = await build({ kind: PlanSuggestionKind.NUTRITION });

			expect(snapshot.history.checkins[0].clientNotes).toContain(
				'Hungry all week',
			);
		});
	});
});
