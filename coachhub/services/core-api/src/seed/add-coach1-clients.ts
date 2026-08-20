import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { EntityManager } from 'typeorm';
import AppDataSource from '../data-source';

import { Coach } from '../coaches/entities/coach.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { Client } from '../clients/entities/client.entity';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { ClientIntake } from '../clients/entities/client-intake.entity';
import { Measurement } from '../measurements/entities/measurement.entity';
import { Checkin } from '../checkins/entities/checkin.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSender } from '../chat/enums/chat-sender.enum';
import { Review } from '../reviews/entities/review.entity';
import { ActivityLog } from '../activity/entities/activity-log.entity';
import { ActivityType } from '../activity/enums/activity-type.enum';
import {
	buildLoggedMealActivitySourceKey,
	buildLoggedSetActivitySourceKey,
} from '../activity/utils/activity-source-key.utils';

import { Program } from '../plans/training/entities/program.entity';
import { ProgramDay } from '../plans/training/entities/program-day.entity';
import { PlannedExercise } from '../plans/training/entities/planned-exercise.entity';
import { LoggedWorkout } from '../plans/training/entities/logged-workout.entity';
import { deriveCompletedWorkoutStatus } from '../plans/training/utils/workout-log.utils';

import { NutritionPlan } from '../plans/nutrition/entities/nutrition-plan.entity';
import { NutritionPlanDay } from '../plans/nutrition/entities/nutrition-plan-day.entity';
import { PlannedMeal } from '../plans/nutrition/entities/planned-meal.entity';
import { NutritionDayLog } from '../plans/nutrition/entities/nutrition-day-log.entity';
import { calculatePlannedMealTotals } from '../plans/nutrition/utils/nutrition-builder.utils';
import { deriveNutritionAdherenceOutcome } from '../plans/nutrition/utils/nutrition-log-state.utils';

import {
	Gender,
	FitnessGoal,
	ActivityLevel,
	TrainingExperience,
	FocusArea,
	TrainingStyle,
	EquipmentType,
	DietaryPreference,
	MembershipStatus,
	CheckinStatus,
	DifficultyLevel,
	SetType,
	ProgramType,
	ProgramStatus,
	SessionStatus,
	SetOutcome,
	MealSlot,
	NutritionPlanType,
	NutritionPlanStatus,
	NutritionLogStatus,
	NutritionAdherenceOutcome,
} from '../common';

/**
 * Adds three extra clients to the coach1@demo.coachhub.test tenant, each with a
 * full history and a live activity streak that the activity-graph endpoint will
 * report as `currentStreakDays`.
 *
 * Separate from demo-seed.ts on purpose: that script bails out the moment coach1
 * exists, so it can never top up an already-seeded tenant. This one only ever
 * INSERTs, and skips any client whose email is already there, so it is safe to
 * re-run against a live database.
 *
 * The streak is not faked in a summary column — there isn't one. Streaks are
 * derived on read from consecutive `activity_logs.activity_date` values, so the
 * only way to produce one is to write the underlying history: real logged
 * workouts and nutrition day logs, then one activity row per reported set and
 * per reported meal, exactly as the client-facing services do.
 */

const COACH_EMAIL = 'coach1@demo.coachhub.test';
const DEMO_PASSWORD = 'password123';
const TIMEZONE = 'Africa/Cairo';

/**
 * Plans span six weeks ending today, so day offset 0..41 always maps to a real
 * program/nutrition day. Streak windows must stay inside that range.
 */
const PLAN_WEEKS = 6;
const PLAN_DAYS = PLAN_WEEKS * 7;

/** UTC noon — Africa/Cairo is UTC+2/+3, so the calendar date never shifts. */
function dayAt(offsetDaysAgo: number, utcHour = 12): Date {
	const date = new Date();
	date.setUTCHours(utcHour, 0, 0, 0);
	date.setUTCDate(date.getUTCDate() - offsetDaysAgo);
	return date;
}
function dateStrAt(offsetDaysAgo: number): string {
	return dayAt(offsetDaysAgo).toISOString().slice(0, 10);
}

/** xorshift32 — same data on every run, so re-seeding is diffable. */
function makeRng(seed: number) {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state >>>= 0;
		state ^= state >>> 17;
		state ^= state << 5;
		state >>>= 0;
		return state / 0xffffffff;
	};
}
type Rng = () => number;
function randInt(rng: Rng, min: number, max: number): number {
	return Math.floor(rng() * (max - min + 1)) + min;
}
function round1(value: number): number {
	return Math.round(value * 10) / 10;
}

/** Inclusive day-offset range, oldest first: [20, 0] is "the last 21 days". */
type ActiveBlock = [oldest: number, newest: number];

interface ClientSpec {
	email: string;
	firstName: string;
	lastName: string;
	gender: Gender;
	ageYears: number;
	heightCm: number;
	/** Weight at the oldest measurement; later ones walk toward today. */
	startWeightKg: number;
	weightKgPerWeek: number;
	startBodyFatPct: number;
	bodyFatPctPerWeek: number;
	goal: FitnessGoal;
	activityLevel: ActivityLevel;
	trainingExperience: TrainingExperience;
	trainingDaysPerWeek: number;
	focusAreas: FocusArea[];
	trainingStyles: TrainingStyle[];
	availableEquipment: EquipmentType[];
	dietaryPreferences: DietaryPreference[];
	intakeNotes: string;
	joinedDaysAgo: number;
	monthlyPrice: number;
	difficulty: DifficultyLevel;
	/** Program day numbers (1-7) that are rest days in every week. */
	restDayNumbers: number[];
	exercisesPerDay: number;
	mealsPerDay: number;
	baseWeightKg: number;
	weeklyLoadStepKg: number;
	targets: {
		calories: number;
		proteinG: number;
		carbsG: number;
		fatG: number;
		fiberG: number;
		waterMl: number;
	};
	/** Consecutive runs of activity. The first block must reach offset 0 or 1. */
	activeBlocks: ActiveBlock[];
	/** Isolated active days, for heat-map texture. Must not extend a block. */
	extraActiveDays: number[];
	programName: string;
	programDescription: string;
	planName: string;
	planDescription: string;
	chat: Array<[ChatSender, string, number]>;
	checkins: Array<{
		offset: number;
		status: CheckinStatus;
		notes?: string;
		metrics?: Record<string, number>;
		feedback?: string;
	}>;
	review?: { rating: number; comment: string };
	seed: number;
}

const CLIENT_SPECS: ClientSpec[] = [
	{
		email: 'client29@demo.coachhub.test',
		firstName: 'Mariam',
		lastName: 'Fathy',
		gender: Gender.FEMALE,
		ageYears: 29,
		heightCm: 165,
		startWeightKg: 78.4,
		weightKgPerWeek: -0.45,
		startBodyFatPct: 33.2,
		bodyFatPctPerWeek: -0.28,
		goal: FitnessGoal.FAT_LOSS,
		activityLevel: ActivityLevel.MODERATELY_ACTIVE,
		trainingExperience: TrainingExperience.INTERMEDIATE,
		trainingDaysPerWeek: 5,
		focusAreas: [FocusArea.WEIGHT_LOSS, FocusArea.CARDIO],
		trainingStyles: [TrainingStyle.HIIT, TrainingStyle.STRENGTH],
		availableEquipment: [EquipmentType.FULL_GYM],
		dietaryPreferences: [DietaryPreference.HALAL, DietaryPreference.LOW_CARB],
		intakeNotes:
			'Desk job, two kids. Trains before work, so sessions have to fit in 50 minutes. Knee is fine now but was sore on high-rep squats last year.',
		joinedDaysAgo: 132,
		monthlyPrice: 900,
		difficulty: DifficultyLevel.INTERMEDIATE,
		restDayNumbers: [3, 7],
		exercisesPerDay: 4,
		mealsPerDay: 4,
		baseWeightKg: 22,
		weeklyLoadStepKg: 2.5,
		targets: {
			calories: 1750,
			proteinG: 135,
			carbsG: 145,
			fatG: 58,
			fiberG: 28,
			waterMl: 2500,
		},
		// 21 straight days ending today; offset 21 stays empty so the run ends there.
		activeBlocks: [[20, 0]],
		extraActiveDays: [23, 24, 26, 30, 31, 33, 37, 38, 40],
		programName: 'Mariam · Fat Loss Block 2',
		programDescription:
			'Five training days, upper/lower split with a conditioning finisher. Volume held steady while calories are low.',
		planName: 'Mariam · Low-Carb Cut',
		planDescription:
			'1750 kcal with protein held high to protect lean mass through the deficit.',
		chat: [
			[
				ChatSender.CLIENT,
				'Scale is stuck at 74 for four days now, is that normal?',
				9,
			],
			[
				ChatSender.COACH,
				'Completely normal. You dropped 2.1kg in three weeks — the body holds water when you keep training hard. Waist is still going down, that is the number I am watching.',
				9,
			],
			[ChatSender.CLIENT, 'Ok that helps. Should I add more cardio?', 8],
			[
				ChatSender.COACH,
				'No. Keep the two finishers as they are. If we spend the cardio card now we have nothing left for the last block.',
				8,
			],
			[ChatSender.CLIENT, 'Deal. Also hit 21 days logged today 🎉', 1],
			[
				ChatSender.COACH,
				'That streak is the whole reason this is working. Keep it going.',
				1,
			],
		],
		checkins: [
			{
				offset: 35,
				status: CheckinStatus.REVIEWED,
				notes: 'Tough first week back, energy was low by Thursday.',
				metrics: { mood: 6, energy: 5, sleep_hours: 6 },
				feedback:
					'Expected — first week of a deficit always feels like this. Move your carbs to the pre-workout meal and it should settle.',
			},
			{
				offset: 28,
				status: CheckinStatus.REVIEWED,
				notes: 'Much better. Carbs before training made a big difference.',
				metrics: { mood: 8, energy: 7, sleep_hours: 7 },
				feedback: 'Good. Holding everything the same for another two weeks.',
			},
			{
				offset: 21,
				status: CheckinStatus.REVIEWED,
				notes: 'Sleep slipped a bit, kids were sick. Training still on.',
				metrics: { mood: 7, energy: 6, sleep_hours: 5.5 },
				feedback:
					'You trained through a bad sleep week without missing a session. Nothing to change.',
			},
			{
				offset: 14,
				status: CheckinStatus.REVIEWED,
				notes: 'Best week so far, everything felt easy.',
				metrics: { mood: 9, energy: 8, sleep_hours: 7.5 },
				feedback: 'Adding 2.5kg to your press and row from Monday.',
			},
			{
				offset: 7,
				status: CheckinStatus.SUBMITTED,
				notes: 'Weight stalled but the waist tape moved. Sticking with it.',
				metrics: { mood: 8, energy: 8, sleep_hours: 7 },
			},
			{ offset: -7, status: CheckinStatus.PENDING },
		],
		review: {
			rating: 5,
			comment:
				'Six weeks in and this is the first plan I have actually stuck to. The check-ins are what keep me honest.',
		},
		seed: 1290,
	},
	{
		email: 'client30@demo.coachhub.test',
		firstName: 'Youssef',
		lastName: 'Selim',
		gender: Gender.MALE,
		ageYears: 34,
		heightCm: 178,
		startWeightKg: 71.8,
		weightKgPerWeek: 0.22,
		startBodyFatPct: 14.6,
		bodyFatPctPerWeek: 0.06,
		goal: FitnessGoal.MUSCLE_GAIN,
		activityLevel: ActivityLevel.VERY_ACTIVE,
		trainingExperience: TrainingExperience.ADVANCED,
		trainingDaysPerWeek: 6,
		focusAreas: [FocusArea.STRENGTH],
		trainingStyles: [TrainingStyle.STRENGTH, TrainingStyle.HYPERTROPHY],
		availableEquipment: [EquipmentType.FULL_GYM, EquipmentType.BARBELL],
		dietaryPreferences: [DietaryPreference.OMNIVORE, DietaryPreference.HALAL],
		intakeNotes:
			'Eight years training, wants to add size without losing his abs. Travels for work roughly one week a month — that is where the gaps in the log come from.',
		joinedDaysAgo: 168,
		monthlyPrice: 1200,
		difficulty: DifficultyLevel.ADVANCED,
		restDayNumbers: [7],
		exercisesPerDay: 5,
		mealsPerDay: 5,
		baseWeightKg: 60,
		weeklyLoadStepKg: 5,
		targets: {
			calories: 3100,
			proteinG: 185,
			carbsG: 380,
			fatG: 88,
			fiberG: 35,
			waterMl: 3500,
		},
		// Back from a work trip: 12 days running now, and a 16-day run before it.
		activeBlocks: [
			[11, 0],
			[28, 13],
		],
		extraActiveDays: [34, 35, 38],
		programName: 'Youssef · Lean Bulk Phase 3',
		programDescription:
			'Six-day push/pull/legs. Top set plus back-offs, load stepped up 5kg per week on the main lifts.',
		planName: 'Youssef · 3100 kcal Surplus',
		planDescription:
			'Small surplus with carbs stacked around training. Five feeds a day to make the volume manageable.',
		chat: [
			[
				ChatSender.CLIENT,
				'Back from Dubai. Missed the whole week, gym in the hotel was two dumbbells.',
				13,
			],
			[
				ChatSender.COACH,
				'Not a problem, one week off does nothing at your level. Restart on the week 4 loads, do not try to jump back to where you were.',
				13,
			],
			[
				ChatSender.CLIENT,
				'Felt weak on Monday but by Thursday everything was back.',
				8,
			],
			[ChatSender.COACH, 'Right on schedule. Bench goes to 82.5 next week.', 8],
			[ChatSender.CLIENT, 'Weight is 73.2 now. Still lean?', 3],
			[
				ChatSender.COACH,
				'Waist is unchanged at 79 and you are up 1.4kg — that is exactly the ratio we want. Nothing changes.',
				3,
			],
		],
		checkins: [
			{
				offset: 35,
				status: CheckinStatus.REVIEWED,
				notes: 'Strong week, squats moved well.',
				metrics: { mood: 8, energy: 8, sleep_hours: 7.5 },
				feedback: 'Textbook. Adding 5kg to squat and deadlift.',
			},
			{
				offset: 28,
				status: CheckinStatus.REVIEWED,
				notes: 'Travelling next week, will do what I can.',
				metrics: { mood: 7, energy: 7, sleep_hours: 6.5 },
				feedback:
					'Do not try to replicate the plan in a hotel gym. Two full-body sessions and keep protein up, that is it.',
			},
			{
				offset: 14,
				status: CheckinStatus.REVIEWED,
				notes: 'Back in the gym, felt rusty on day one.',
				metrics: { mood: 7, energy: 6, sleep_hours: 6 },
				feedback:
					'Rust is normal. You are back on the old loads within two sessions.',
			},
			{
				offset: 7,
				status: CheckinStatus.SUBMITTED,
				notes: 'Fully back. Bench PB at 80x5.',
				metrics: { mood: 9, energy: 9, sleep_hours: 8 },
			},
			{ offset: -5, status: CheckinStatus.PENDING },
		],
		review: {
			rating: 5,
			comment:
				'Knows when to push and when to hold. The travel week could have derailed the block and it did not.',
		},
		seed: 1300,
	},
	{
		email: 'client31@demo.coachhub.test',
		firstName: 'Hana',
		lastName: 'AbdelRahman',
		gender: Gender.FEMALE,
		ageYears: 24,
		heightCm: 170,
		startWeightKg: 63.5,
		weightKgPerWeek: -0.12,
		startBodyFatPct: 27.4,
		bodyFatPctPerWeek: -0.16,
		goal: FitnessGoal.RECOMPOSITION,
		activityLevel: ActivityLevel.LIGHTLY_ACTIVE,
		trainingExperience: TrainingExperience.BEGINNER,
		trainingDaysPerWeek: 3,
		focusAreas: [FocusArea.MOBILITY, FocusArea.STRENGTH],
		trainingStyles: [TrainingStyle.MOBILITY, TrainingStyle.HYPERTROPHY],
		availableEquipment: [
			EquipmentType.DUMBBELLS,
			EquipmentType.RESISTANCE_BANDS,
		],
		dietaryPreferences: [DietaryPreference.VEGETARIAN],
		intakeNotes:
			'First time training with a coach. Home setup, one pair of adjustable dumbbells and a band set. Nervous about barbell work, so we are staying away from it for now.',
		joinedDaysAgo: 61,
		monthlyPrice: 700,
		difficulty: DifficultyLevel.BEGINNER,
		restDayNumbers: [3, 6, 7],
		exercisesPerDay: 3,
		mealsPerDay: 3,
		baseWeightKg: 8,
		weeklyLoadStepKg: 1,
		targets: {
			calories: 2050,
			proteinG: 110,
			carbsG: 230,
			fatG: 70,
			fiberG: 32,
			waterMl: 2200,
		},
		// Restarted six days ago after a stumble; her best run so far was nine days.
		activeBlocks: [
			[5, 0],
			[23, 15],
		],
		extraActiveDays: [8, 10, 26, 29, 33],
		programName: 'Hana · Home Foundations',
		programDescription:
			'Three full-body days built around dumbbells and bands, with a mobility flow on every session.',
		planName: 'Hana · Vegetarian Maintenance',
		planDescription:
			'Maintenance calories while she learns to hit protein on a vegetarian diet. Three meals, no snacking rules yet.',
		chat: [
			[
				ChatSender.CLIENT,
				'I missed a whole week, I am so sorry. Work got insane.',
				8,
			],
			[
				ChatSender.COACH,
				'Do not apologise, missing a week is not a failure. You logged nine days straight before that — that is the part that matters. Start again tomorrow at week 3.',
				8,
			],
			[ChatSender.CLIENT, 'Started again. Six days in a row now!', 1],
			[
				ChatSender.COACH,
				'There it is. Beat nine and I will build you a new block.',
				1,
			],
			[
				ChatSender.CLIENT,
				'Also protein is hard without meat, I keep landing around 80g.',
				2,
			],
			[
				ChatSender.COACH,
				'Add Greek yoghurt to breakfast and a scoop after training. That is 40g without changing anything else.',
				2,
			],
		],
		checkins: [
			{
				offset: 28,
				status: CheckinStatus.REVIEWED,
				notes:
					'Really enjoying it so far, sore for two days after every session though.',
				metrics: { mood: 8, energy: 7, sleep_hours: 7 },
				feedback:
					'That settles down by week three. Do the mobility flow on your off days and it will speed up.',
			},
			{
				offset: 21,
				status: CheckinStatus.REVIEWED,
				notes: 'Soreness is gone. Dumbbells feel light now.',
				metrics: { mood: 9, energy: 8, sleep_hours: 7.5 },
				feedback: 'Good sign. Going up 1kg on the presses.',
			},
			{
				offset: 14,
				status: CheckinStatus.MISSED,
			},
			{
				offset: 7,
				status: CheckinStatus.SUBMITTED,
				notes:
					'Back on track after the bad week. Feeling much better about it.',
				metrics: { mood: 7, energy: 7, sleep_hours: 6.5 },
			},
			{ offset: -6, status: CheckinStatus.PENDING },
		],
		seed: 1310,
	},
];

interface TenantLibrary {
	coach: Coach;
	tenant: Tenant;
	exercises: Array<{
		id: string;
		name: string;
		category: string;
		primary_muscle: string;
		secondary_muscles: string[];
		equipment: string[];
		demo_video_url: string | null;
		demo_gif_url: string | null;
		thumbnail_url: string | null;
		instruction_steps: string[];
	}>;
	meals: Array<{
		id: string;
		name: string;
		dietary_tags: string[];
		allergens: string[];
	}>;
	mealIngredients: Map<string, any[]>;
}

async function loadTenantLibrary(
	manager: EntityManager,
): Promise<TenantLibrary> {
	const coach = await manager.findOne(Coach, { where: { email: COACH_EMAIL } });
	if (!coach) {
		throw new Error(
			`${COACH_EMAIL} does not exist in this database — run "npm run seed:demo" first.`,
		);
	}

	const tenant = await manager.findOne(Tenant, {
		where: { ownerCoach: { id: coach.id } },
	});
	if (!tenant) {
		throw new Error(`${COACH_EMAIL} exists but owns no tenant.`);
	}

	const exercises = await manager.query(
		`SELECT id, name, category, primary_muscle, secondary_muscles, equipment,
		        demo_video_url, demo_gif_url, thumbnail_url, instruction_steps
		 FROM exercises WHERE tenant_id = $1 AND is_active ORDER BY name`,
		[tenant.id],
	);
	const meals = await manager.query(
		`SELECT id, name, dietary_tags, allergens
		 FROM meals WHERE tenant_id = $1 AND is_active ORDER BY name`,
		[tenant.id],
	);
	if (exercises.length === 0 || meals.length === 0) {
		throw new Error(
			`Tenant ${tenant.id} has ${exercises.length} exercises and ${meals.length} meals — cannot build plans.`,
		);
	}

	const mealIngredients = new Map<string, any[]>();
	for (const meal of meals) {
		mealIngredients.set(
			meal.id,
			await manager.query(
				`SELECT mi.food_id, mi.amount, mi.position,
				        f.name, f.brand, f.serving_size, f.serving_unit,
				        f.calories, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g
				 FROM meal_ingredients mi
				 JOIN foods f ON f.id = mi.food_id
				 WHERE mi.meal_id = $1
				 ORDER BY mi.position`,
				[meal.id],
			),
		);
	}

	return { coach, tenant, exercises, meals, mealIngredients };
}

/** Day offsets (0 = today) that must carry at least one activity row. */
function resolveActiveOffsets(spec: ClientSpec): number[] {
	const offsets = new Set<number>();
	for (const [oldest, newest] of spec.activeBlocks) {
		for (let offset = newest; offset <= oldest; offset++) offsets.add(offset);
	}
	for (const offset of spec.extraActiveDays) offsets.add(offset);
	return [...offsets]
		.filter((o) => o >= 0 && o < PLAN_DAYS)
		.sort((a, b) => b - a);
}

async function seedProgram(
	manager: EntityManager,
	library: TenantLibrary,
	spec: ClientSpec,
	membership: ClientMembership,
	rng: Rng,
) {
	const program = await manager.save(
		manager.create(Program, {
			tenant: library.tenant,
			createdBy: library.coach,
			programType: ProgramType.CLIENT,
			membership,
			name: spec.programName,
			description: spec.programDescription,
			goal: spec.goal,
			difficulty: spec.difficulty,
			durationWeeks: PLAN_WEEKS,
			startDate: dateStrAt(PLAN_DAYS - 1),
			endDate: dateStrAt(0),
			status: ProgramStatus.PUBLISHED,
			weeks: Array.from({ length: PLAN_WEEKS }, (_, w) => ({
				tenant: library.tenant,
				weekNumber: w + 1,
				days: Array.from({ length: 7 }, (_, d) => {
					const dayNumber = d + 1;
					const isRestDay = spec.restDayNumbers.includes(dayNumber);
					return {
						tenant: library.tenant,
						dayNumber,
						name: isRestDay ? 'Rest Day' : `Week ${w + 1} · Day ${dayNumber}`,
						isRestDay,
					};
				}),
			})),
		}),
	);

	// offset 0 is today and lives at the end of the plan, so index counts backwards
	const dayByOffset = new Map<number, ProgramDay>();
	for (const week of program.weeks) {
		for (const day of week.days) {
			const index = (week.weekNumber - 1) * 7 + (day.dayNumber - 1);
			dayByOffset.set(PLAN_DAYS - 1 - index, day);
		}
	}

	for (const week of program.weeks) {
		for (const day of week.days) {
			if (day.isRestDay) continue;
			const rotation = (week.weekNumber - 1) * 7 + day.dayNumber;
			const chosen = Array.from({ length: spec.exercisesPerDay }, (_, i) => {
				const index =
					(rotation * spec.exercisesPerDay + i * 7 + spec.seed) %
					library.exercises.length;
				return library.exercises[index];
			});
			await manager.save(
				PlannedExercise,
				chosen.map((exercise, position) => ({
					tenant: library.tenant,
					programDay: day,
					exercise: { id: exercise.id },
					exerciseName: exercise.name,
					category: exercise.category,
					primaryMuscle: exercise.primary_muscle,
					secondaryMuscles: exercise.secondary_muscles ?? [],
					equipment: exercise.equipment ?? [],
					demoVideoUrl: exercise.demo_video_url,
					demoGifUrl: exercise.demo_gif_url,
					thumbnailUrl: exercise.thumbnail_url,
					instructionSteps: exercise.instruction_steps ?? [],
					position: position + 1,
					restSeconds: 90,
					sets: Array.from({ length: 3 }, (_, s) => ({
						setNumber: s + 1,
						setType: SetType.WORKING,
						repsMin: 8,
						repsMax: 12,
						// progressive overload: same movement, heavier every week
						weightKg:
							spec.baseWeightKg +
							(week.weekNumber - 1) * spec.weeklyLoadStepKg +
							position * randInt(rng, 2, 6),
					})),
				})) as unknown as PlannedExercise[],
			);
		}
	}

	return { program, dayByOffset };
}

async function seedNutritionPlan(
	manager: EntityManager,
	library: TenantLibrary,
	spec: ClientSpec,
	membership: ClientMembership,
) {
	const plan = await manager.save(
		manager.create(NutritionPlan, {
			tenant: library.tenant,
			createdBy: library.coach,
			planType: NutritionPlanType.CLIENT,
			membership,
			name: spec.planName,
			description: spec.planDescription,
			goal: spec.goal,
			durationWeeks: PLAN_WEEKS,
			startDate: dateStrAt(PLAN_DAYS - 1),
			endDate: dateStrAt(0),
			targetCalories: spec.targets.calories,
			targetProteinG: spec.targets.proteinG,
			targetCarbsG: spec.targets.carbsG,
			targetFatG: spec.targets.fatG,
			targetFiberG: spec.targets.fiberG,
			targetWaterMl: spec.targets.waterMl,
			status: NutritionPlanStatus.PUBLISHED,
			weeks: Array.from({ length: PLAN_WEEKS }, (_, w) => ({
				tenant: library.tenant,
				weekNumber: w + 1,
				days: Array.from({ length: 7 }, (_, d) => ({
					tenant: library.tenant,
					dayNumber: d + 1,
				})),
			})),
		}),
	);

	const dayByOffset = new Map<number, NutritionPlanDay>();
	for (const week of plan.weeks) {
		for (const day of week.days) {
			const index = (week.weekNumber - 1) * 7 + (day.dayNumber - 1);
			dayByOffset.set(PLAN_DAYS - 1 - index, day);
		}
	}

	const slots = [
		MealSlot.BREAKFAST,
		MealSlot.LUNCH,
		MealSlot.DINNER,
		MealSlot.SNACK,
		MealSlot.POST_WORKOUT,
	];
	for (const week of plan.weeks) {
		for (const day of week.days) {
			const rotation = (week.weekNumber - 1) * 7 + day.dayNumber;
			const chosen = Array.from({ length: spec.mealsPerDay }, (_, i) => {
				const index =
					(rotation * spec.mealsPerDay + i * 3 + spec.seed) %
					library.meals.length;
				return library.meals[index];
			});
			await manager.save(
				PlannedMeal,
				chosen.map((meal, position) => ({
					tenant: library.tenant,
					nutritionPlanDay: day,
					sourceMeal: { id: meal.id },
					mealName: meal.name,
					dietaryTags: meal.dietary_tags ?? [],
					allergens: meal.allergens ?? [],
					slot: slots[position] ?? MealSlot.SNACK,
					position: position + 1,
					foods: (library.mealIngredients.get(meal.id) ?? []).map(
						(ing, foodPosition) => ({
							sourceFood: { id: ing.food_id },
							foodName: ing.name,
							brand: ing.brand,
							servingSize: ing.serving_size,
							servingUnit: ing.serving_unit,
							amount: ing.amount,
							caloriesPerServing: ing.calories,
							proteinGPerServing: ing.protein_g,
							carbsGPerServing: ing.carbs_g,
							fatGPerServing: ing.fat_g,
							fiberGPerServing: ing.fiber_g,
							position: foodPosition + 1,
						}),
					),
				})) as unknown as PlannedMeal[],
			);
		}
	}

	return { plan, dayByOffset };
}

interface ActivityContext {
	clientId: string;
	tenantId: string;
	membershipId: string;
}

async function recordActivity(
	manager: EntityManager,
	context: ActivityContext,
	activityType: ActivityType,
	sourceKeys: string[],
	offset: number,
	occurredAt: Date,
) {
	if (sourceKeys.length === 0) return 0;
	await manager.save(
		ActivityLog,
		sourceKeys.map((sourceKey) =>
			manager.create(ActivityLog, {
				clientId: context.clientId,
				tenantId: context.tenantId,
				membershipId: context.membershipId,
				activityType,
				sourceKey,
				activityDate: dateStrAt(offset),
				occurredAt,
			}),
		),
	);
	return sourceKeys.length;
}

/**
 * Writes one training session for the given day offset and returns how many
 * activity rows it produced. Skipped sets deliberately produce none, mirroring
 * ClientWorkoutSetLoggingService.
 */
async function seedWorkoutForOffset(
	manager: EntityManager,
	library: TenantLibrary,
	context: ActivityContext,
	membership: ClientMembership,
	program: Program,
	day: ProgramDay,
	offset: number,
	rng: Rng,
) {
	const plannedExercises = await manager.find(PlannedExercise, {
		where: { programDayId: day.id },
		relations: { sets: true },
		order: { position: 'ASC' },
	});
	if (plannedExercises.length === 0) return 0;

	const startedAt = dayAt(offset, randInt(rng, 5, 17));
	const durationMinutes = randInt(rng, 42, 68);
	const outcomes: SetOutcome[] = [];
	let isFirstSet = true;

	const exercises = plannedExercises.map((planned) => ({
		plannedExercise: planned,
		exercise: { id: planned.exerciseId } as any,
		exerciseName: planned.exerciseName,
		position: planned.position,
		sets: [...planned.sets]
			.sort((a, b) => a.setNumber - b.setNumber)
			.map((plannedSet) => {
				// the opening set always lands, so an active day never ends up empty
				const roll = isFirstSet ? 0 : rng();
				isFirstSet = false;
				const outcome =
					roll < 0.85
						? SetOutcome.COMPLETED
						: roll < 0.96
							? SetOutcome.PARTIAL
							: SetOutcome.SKIPPED;
				outcomes.push(outcome);

				const reported = outcome !== SetOutcome.SKIPPED;
				const prescribedWeight = Number(plannedSet.weightKg);
				return {
					plannedSet,
					setNumber: plannedSet.setNumber,
					isExtra: false,
					prescribedSetType: plannedSet.setType,
					prescribedRepsMin: plannedSet.repsMin,
					prescribedRepsMax: plannedSet.repsMax,
					prescribedWeightKg: plannedSet.weightKg,
					reps: reported
						? outcome === SetOutcome.COMPLETED
							? randInt(rng, plannedSet.repsMin ?? 8, plannedSet.repsMax ?? 12)
							: randInt(rng, 4, (plannedSet.repsMin ?? 8) - 1)
						: null,
					weightKg: reported ? prescribedWeight : null,
					durationSeconds: null,
					rpe: reported ? randInt(rng, 60, 92) / 10 : null,
					outcome,
				};
			}),
	}));

	const status = deriveCompletedWorkoutStatus(outcomes);
	const completedAt = new Date(
		startedAt.getTime() + durationMinutes * 60 * 1000,
	);
	const workout = await manager.save(
		manager.create(LoggedWorkout, {
			tenant: library.tenant,
			membership,
			program,
			programDay: day,
			scheduledDate: dateStrAt(offset),
			startedAt,
			completedAt,
			durationMinutes,
			status,
			overallRpe: randInt(rng, 62, 88) / 10,
			exercises: exercises as any,
		}),
	);

	const reportedSets: Array<{ id: string }> = await manager.query(
		`SELECT ls.id
		 FROM logged_sets ls
		 JOIN logged_exercises le ON le.id = ls.logged_exercise_id
		 WHERE le.logged_workout_id = $1 AND ls.outcome IN ('completed', 'partial')`,
		[workout.id],
	);

	return recordActivity(
		manager,
		context,
		ActivityType.WORKOUT_SET_REPORTED,
		reportedSets.map((row) => buildLoggedSetActivitySourceKey(row.id)),
		offset,
		completedAt,
	);
}

/**
 * Writes one finalized nutrition day and returns how many activity rows it
 * produced. Every active offset gets one of these, which is what guarantees the
 * streak stays unbroken even on rest days.
 */
async function seedNutritionDayForOffset(
	manager: EntityManager,
	library: TenantLibrary,
	context: ActivityContext,
	membership: ClientMembership,
	spec: ClientSpec,
	plan: NutritionPlan,
	day: NutritionPlanDay,
	offset: number,
	rng: Rng,
) {
	const plannedMeals = await manager.find(PlannedMeal, {
		where: { nutritionPlanDayId: day.id },
		relations: { foods: true },
		order: { position: 'ASC' },
	});
	if (plannedMeals.length === 0) return 0;

	const outcomes: NutritionAdherenceOutcome[] = [];
	let isFirstMeal = true;

	const meals = plannedMeals.map((plannedMeal) => {
		const roll = isFirstMeal ? 0 : rng();
		isFirstMeal = false;
		const outcome =
			roll < 0.8
				? NutritionAdherenceOutcome.COMPLETED
				: roll < 0.94
					? NutritionAdherenceOutcome.PARTIAL
					: NutritionAdherenceOutcome.SKIPPED;
		outcomes.push(outcome);

		const totals = calculatePlannedMealTotals(plannedMeal.foods);
		return {
			plannedMeal,
			sourceMeal: { id: plannedMeal.sourceMealId } as any,
			mealName: plannedMeal.mealName,
			slot: plannedMeal.slot,
			position: plannedMeal.position,
			prescribedCalories: totals.calories,
			prescribedProteinG: totals.proteinG,
			prescribedCarbsG: totals.carbsG,
			prescribedFatG: totals.fatG,
			prescribedFiberG: totals.fiberG,
			outcome,
		};
	});

	const startedAt = dayAt(offset, 6);
	const completedAt = dayAt(offset, 20);
	const dayLog = await manager.save(
		manager.create(NutritionDayLog, {
			tenant: library.tenant,
			membership,
			nutritionPlan: plan,
			nutritionPlanDay: day,
			scheduledDate: dateStrAt(offset),
			status: NutritionLogStatus.FINALIZED,
			adherenceOutcome: deriveNutritionAdherenceOutcome(outcomes),
			waterMlConsumed: randInt(
				rng,
				spec.targets.waterMl - 700,
				spec.targets.waterMl + 400,
			),
			startedAt,
			completedAt,
			meals: meals as any,
		}),
	);

	const reportedMeals: Array<{ id: string }> = await manager.query(
		`SELECT id FROM logged_meals
		 WHERE nutrition_day_log_id = $1 AND outcome IN ('completed', 'partial')`,
		[dayLog.id],
	);

	return recordActivity(
		manager,
		context,
		ActivityType.NUTRITION_MEAL_REPORTED,
		reportedMeals.map((row) => buildLoggedMealActivitySourceKey(row.id)),
		offset,
		completedAt,
	);
}

interface SeedResult {
	email: string;
	name: string;
	activeDays: number;
	activityRows: number;
	workouts: number;
	nutritionDays: number;
	currentStreak: number;
	longestStreak: number;
}

/** Mirrors ActivityGraphService so the script can report what the API will. */
function summariseStreaks(activeOffsets: number[]) {
	const active = new Set(activeOffsets);
	let current = 0;
	let cursor = active.has(0) ? 0 : active.has(1) ? 1 : -1;
	while (cursor >= 0 && active.has(cursor)) {
		current += 1;
		cursor += 1;
	}

	const sorted = [...active].sort((a, b) => b - a);
	let longest = 0;
	let run = 0;
	for (let i = 0; i < sorted.length; i++) {
		run = i > 0 && sorted[i - 1] - sorted[i] === 1 ? run + 1 : 1;
		longest = Math.max(longest, run);
	}
	return { current, longest };
}

async function seedClient(
	manager: EntityManager,
	library: TenantLibrary,
	spec: ClientSpec,
	passwordHash: string,
): Promise<SeedResult> {
	const rng = makeRng(spec.seed);

	const client = await manager.save(
		manager.create(Client, {
			email: spec.email,
			password: passwordHash,
			firstName: spec.firstName,
			lastName: spec.lastName,
			timezone: TIMEZONE,
			dateOfBirth: dateStrAt(spec.ageYears * 365 + randInt(rng, 0, 200)),
			gender: spec.gender,
			heightCm: spec.heightCm,
			weightKg: round1(spec.startWeightKg + spec.weightKgPerWeek * 12),
			isEmailVerified: true,
		}),
	);

	const membership = await manager.save(
		manager.create(ClientMembership, {
			tenant: library.tenant,
			client,
			status: MembershipStatus.ACTIVE,
			monthlyPrice: spec.monthlyPrice,
			currency: 'EGP',
			joinedAt: dayAt(spec.joinedDaysAgo),
			lastActiveAt: dayAt(0, 19),
		}),
	);

	await manager.save(
		manager.create(ClientIntake, {
			tenant: library.tenant,
			membership,
			goal: spec.goal,
			activityLevel: spec.activityLevel,
			trainingExperience: spec.trainingExperience,
			trainingDaysPerWeek: spec.trainingDaysPerWeek,
			focusAreas: spec.focusAreas,
			trainingStyles: spec.trainingStyles,
			availableEquipment: spec.availableEquipment,
			dietaryPreferences: spec.dietaryPreferences,
			notes: spec.intakeNotes,
		}),
	);

	// 13 weeks of biweekly measurements, oldest first, walking toward today
	const measurementOffsets = [84, 70, 56, 42, 28, 14, 0];
	await manager.save(
		measurementOffsets.map((offset, index) => {
			const weeksElapsed = (84 - offset) / 7;
			const isReviewed = offset >= 14;
			return manager.create(Measurement, {
				tenant: library.tenant,
				membership,
				measuredAt: dateStrAt(offset),
				weightKg: round1(
					spec.startWeightKg + spec.weightKgPerWeek * weeksElapsed,
				),
				bodyFatPct: round1(
					spec.startBodyFatPct + spec.bodyFatPctPerWeek * weeksElapsed,
				),
				chestCm: round1(94 + index * 0.3 + randInt(rng, -4, 4)),
				waistCm: round1(
					88 +
						(spec.weightKgPerWeek < 0
							? -weeksElapsed * 0.35
							: weeksElapsed * 0.05),
				),
				hipsCm: round1(
					99 + (spec.weightKgPerWeek < 0 ? -weeksElapsed * 0.25 : 0),
				),
				armCm: round1(30 + weeksElapsed * 0.08 + randInt(rng, -2, 2)),
				thighCm: round1(55 + randInt(rng, -3, 3)),
				reviewedAt: isReviewed ? dayAt(offset - 1, 18) : null,
				reviewedBy: isReviewed ? library.coach.id : null,
				coachFeedback: isReviewed
					? spec.weightKgPerWeek < 0
						? 'Waist is moving faster than the scale — that is exactly what we want. No changes.'
						: 'Weight up, waist flat. Keep the surplus where it is.'
					: null,
			});
		}),
	);

	await manager.save(
		spec.checkins.map((checkin) =>
			manager.create(Checkin, {
				tenant: library.tenant,
				membership,
				scheduledFor: dateStrAt(checkin.offset),
				status: checkin.status,
				submittedAt:
					checkin.status === CheckinStatus.SUBMITTED ||
					checkin.status === CheckinStatus.REVIEWED
						? dayAt(checkin.offset - 1, 18)
						: null,
				clientNotes: checkin.notes ?? null,
				metrics: checkin.metrics ?? null,
				reviewedAt:
					checkin.status === CheckinStatus.REVIEWED
						? dayAt(checkin.offset - 2, 9)
						: null,
				reviewer:
					checkin.status === CheckinStatus.REVIEWED ? library.coach : null,
				coachFeedback: checkin.feedback ?? null,
			}),
		),
	);

	await manager.save(
		spec.chat.map(([senderType, body, offset]) =>
			manager.create(ChatMessage, {
				tenantId: library.tenant.id,
				clientId: client.id,
				senderType,
				body,
				readAt: offset > 1 ? dayAt(offset - 1, 8) : null,
				createdAt: dayAt(offset, 17),
			}),
		),
	);

	if (spec.review) {
		await manager.save(
			manager.create(Review, {
				tenant: library.tenant,
				client,
				rating: spec.review.rating,
				comment: spec.review.comment,
			}),
		);
	}

	const { program, dayByOffset: programDays } = await seedProgram(
		manager,
		library,
		spec,
		membership,
		rng,
	);
	const { plan, dayByOffset: planDays } = await seedNutritionPlan(
		manager,
		library,
		spec,
		membership,
	);

	const context: ActivityContext = {
		clientId: client.id,
		tenantId: library.tenant.id,
		membershipId: membership.id,
	};
	const activeOffsets = resolveActiveOffsets(spec);
	let activityRows = 0;
	let workouts = 0;
	let nutritionDays = 0;

	for (const offset of activeOffsets) {
		const nutritionDay = planDays.get(offset);
		if (nutritionDay) {
			activityRows += await seedNutritionDayForOffset(
				manager,
				library,
				context,
				membership,
				spec,
				plan,
				nutritionDay,
				offset,
				rng,
			);
			nutritionDays++;
		}

		const programDay = programDays.get(offset);
		if (programDay && !programDay.isRestDay) {
			activityRows += await seedWorkoutForOffset(
				manager,
				library,
				context,
				membership,
				program,
				programDay,
				offset,
				rng,
			);
			workouts++;
		}
	}

	const streaks = summariseStreaks(activeOffsets);
	return {
		email: spec.email,
		name: `${spec.firstName} ${spec.lastName}`,
		activeDays: activeOffsets.length,
		activityRows,
		workouts,
		nutritionDays,
		currentStreak: streaks.current,
		longestStreak: streaks.longest,
	};
}

/** Sentinel used to roll the whole transaction back under SEED_DRY_RUN=1. */
class DryRunRollback extends Error {}

async function main() {
	const isDryRun = process.env.SEED_DRY_RUN === '1';
	await AppDataSource.initialize();

	const results: SeedResult[] = [];
	const skipped: string[] = [];

	try {
		await AppDataSource.transaction(async (manager) => {
			const library = await loadTenantLibrary(manager);
			console.log(
				`Coach ${COACH_EMAIL} → tenant "${library.tenant.name}" (${library.tenant.id})`,
			);

			const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
			for (const spec of CLIENT_SPECS) {
				const existing = await manager.findOne(Client, {
					where: { email: spec.email },
					select: { id: true },
				});
				if (existing) {
					skipped.push(spec.email);
					continue;
				}
				console.log(`  seeding ${spec.email} …`);
				results.push(await seedClient(manager, library, spec, passwordHash));
			}

			if (isDryRun) {
				// Everything above has been exercised against the real schema;
				// throwing here rolls it all back instead of committing.
				throw new DryRunRollback();
			}
		});
	} catch (error) {
		if (!(error instanceof DryRunRollback)) throw error;
	} finally {
		await AppDataSource.destroy();
	}

	console.log(
		isDryRun
			? '\n======== DRY RUN — NOTHING WAS COMMITTED ========'
			: '\n============ COACH1 CLIENTS ADDED ============',
	);
	if (skipped.length > 0) {
		console.log(`Already present, left untouched: ${skipped.join(', ')}`);
	}
	if (results.length === 0) {
		console.log('Nothing new to add.');
	} else {
		console.log(`Password for every account below: ${DEMO_PASSWORD}\n`);
		for (const result of results) {
			console.log(`${result.email}  (${result.name})`);
			console.log(
				`  current streak ${result.currentStreak} days · longest ${result.longestStreak} days`,
			);
			console.log(
				`  ${result.activeDays} active days · ${result.workouts} workouts · ${result.nutritionDays} nutrition days · ${result.activityRows} activity rows`,
			);
		}
	}
	console.log('==============================================\n');
}

main().catch(async (error) => {
	console.error('add-coach1-clients failed:', error);
	try {
		await AppDataSource.destroy();
	} catch {
		/* already closed */
	}
	process.exit(1);
});
