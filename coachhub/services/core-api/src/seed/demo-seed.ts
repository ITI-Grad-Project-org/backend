import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
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
import { Invitation } from '../invitation/entities/invitation.entity';
import { InvitaionStatusEnum } from '../invitation/enums/invitaion-status.enum';
import { ActivityLog } from '../activity/entities/activity-log.entity';
import { ActivityType } from '../activity/enums/activity-type.enum';

import { Program } from '../plans/training/entities/program.entity';
import { ProgramWeek } from '../plans/training/entities/program-week.entity';
import { ProgramDay } from '../plans/training/entities/program-day.entity';
import { PlannedExercise } from '../plans/training/entities/planned-exercise.entity';
import { PlannedSet } from '../plans/training/entities/planned-set.entity';
import { LoggedWorkout } from '../plans/training/entities/logged-workout.entity';
import { LoggedExercise } from '../plans/training/entities/logged-exercise.entity';
import { LoggedSet } from '../plans/training/entities/logged-set.entity';

import { NutritionPlan } from '../plans/nutrition/entities/nutrition-plan.entity';
import { NutritionPlanWeek } from '../plans/nutrition/entities/nutrition-plan-week.entity';
import { NutritionPlanDay } from '../plans/nutrition/entities/nutrition-plan-day.entity';
import { PlannedMeal } from '../plans/nutrition/entities/planned-meal.entity';
import { PlannedMealFood } from '../plans/nutrition/entities/planned-meal-food.entity';
import { NutritionDayLog } from '../plans/nutrition/entities/nutrition-day-log.entity';
import { LoggedMeal } from '../plans/nutrition/entities/logged-meal.entity';

import {
	Gender,
	CoachSpecialty,
	OfflineAvailability,
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
 * Demo/showcase data for every table, safe to run against a real database.
 *
 * Every seeded coach/client email lives under DEMO_EMAIL_DOMAIN and shares
 * ONE bcrypt hash of "password123" — this is throwaway demo data, not
 * production credentials, so a shared password is fine here.
 *
 * Idempotent: checks for the first fixed demo coach email before doing
 * anything else, and only ever INSERTs — never touches an existing row.
 */

const DEMO_EMAIL_DOMAIN = 'demo.coachhub.test';
const DEMO_PASSWORD = 'password123';
const COACH_COUNT = 6;
const CLIENT_COUNT = 28;

const MALE_NAMES = [
	'Ahmed',
	'Youssef',
	'Omar',
	'Karim',
	'Mostafa',
	'Hassan',
	'Tarek',
	'Sherif',
	'Adel',
	'Ziad',
	'Amr',
	'Khaled',
	'Mahmoud',
	'Seif',
];
const FEMALE_NAMES = [
	'Mariam',
	'Nour',
	'Salma',
	'Yasmin',
	'Aya',
	'Heba',
	'Dina',
	'Rana',
	'Farida',
	'Laila',
	'Malak',
	'Hana',
	'Jana',
	'Sara',
];
const LAST_NAMES = [
	'Hassan',
	'Ibrahim',
	'ElSayed',
	'Farouk',
	'Kamal',
	'AbdelRahman',
	'ElShazly',
	'Mansour',
	'Fathy',
	'Naguib',
	'Selim',
	'Gaber',
	'Nour',
	'Aziz',
];
const CITIES = [
	'Cairo, EG',
	'Giza, EG',
	'Alexandria, EG',
	'Sheikh Zayed, EG',
	'New Cairo, EG',
	'Mansoura, EG',
];

let rngState = 42; // fixed seed → same-shaped demo data on every fresh DB
function rand(): number {
	// xorshift32 — deterministic, no dependency needed
	rngState ^= rngState << 13;
	rngState ^= rngState >>> 17;
	rngState ^= rngState << 5;
	rngState >>>= 0;
	return rngState / 0xffffffff;
}
function randInt(min: number, max: number): number {
	return Math.floor(rand() * (max - min + 1)) + min;
}
function pick<T>(arr: readonly T[]): T {
	return arr[randInt(0, arr.length - 1)];
}
function pickMany<T>(arr: readonly T[], n: number): T[] {
	const copy = [...arr];
	const out: T[] = [];
	for (let i = 0; i < n && copy.length > 0; i++) {
		out.push(copy.splice(randInt(0, copy.length - 1), 1)[0]);
	}
	return out;
}
function daysAgo(n: number): Date {
	const d = new Date();
	d.setUTCHours(12, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() - n);
	return d;
}
function daysFromNow(n: number): Date {
	return daysAgo(-n);
}
function toDateStr(d: Date): string {
	return d.toISOString().slice(0, 10);
}
function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

interface SeededTenant {
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
	mealIngredients: Map<
		string,
		Array<{
			food_id: string;
			amount: string;
			position: number;
			name: string;
			brand: string | null;
			serving_size: string;
			serving_unit: string;
			calories: string;
			protein_g: string;
			carbs_g: string;
			fat_g: string;
			fiber_g: string | null;
		}>
	>;
}

async function copyExerciseLibrary(manager: EntityManager, tenantId: string) {
	await manager.query(
		`INSERT INTO exercises
		 (tenant_id, source_seed_id, created_by, name, category,
		  primary_muscle, secondary_muscles, equipment, demo_video_url,
		  demo_gif_url, thumbnail_url, instruction_steps, is_active)
		 SELECT $1, seed.id, NULL, seed.name, seed.category,
		        seed.primary_muscle, seed.secondary_muscles, seed.equipment,
		        seed.demo_video_url, seed.demo_gif_url, seed.thumbnail_url,
		        seed.instruction_steps, TRUE
		 FROM default_exercises seed
		 WHERE seed.is_active
		   AND NOT EXISTS (
		     SELECT 1 FROM exercises existing
		     WHERE existing.tenant_id = $1
		       AND (existing.source_seed_id = seed.id OR LOWER(existing.name) = LOWER(seed.name))
		   )
		 ON CONFLICT (tenant_id, name) DO NOTHING`,
		[tenantId],
	);
}

async function copyNutritionLibrary(
	manager: EntityManager,
	tenantId: string,
	coachId: string,
) {
	await manager.query(
		`INSERT INTO foods
		 (tenant_id, source_seed_id, created_by, name, brand, serving_size,
		  serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g,
		  dietary_tags, allergens, is_active)
		 SELECT $1, seed.id, $2, seed.name, seed.brand, seed.serving_size,
		        seed.serving_unit, seed.calories, seed.protein_g, seed.carbs_g,
		        seed.fat_g, seed.fiber_g, seed.dietary_tags, seed.allergens, TRUE
		 FROM default_foods seed
		 WHERE seed.is_active
		   AND NOT EXISTS (
		     SELECT 1 FROM foods existing
		     WHERE existing.tenant_id = $1
		       AND (existing.source_seed_id = seed.id
		            OR (LOWER(existing.name) = LOWER(seed.name) AND existing.brand IS NOT DISTINCT FROM seed.brand))
		   )
		 ON CONFLICT (tenant_id, name, brand) DO NOTHING`,
		[tenantId, coachId],
	);

	const createdMeals: Array<{ id: string }> = await manager.query(
		`INSERT INTO meals
		 (tenant_id, source_seed_id, created_by, name, description, prep_notes,
		  dietary_tags, allergens, is_active)
		 SELECT $1, seed.id, $2, seed.name, seed.description, seed.prep_notes,
		        seed.dietary_tags, seed.allergens, TRUE
		 FROM default_meals seed
		 WHERE seed.is_active
		   AND NOT EXISTS (
		     SELECT 1 FROM meals existing
		     WHERE existing.tenant_id = $1
		       AND (existing.source_seed_id = seed.id OR LOWER(existing.name) = LOWER(seed.name))
		   )
		   AND NOT EXISTS (
		     SELECT 1 FROM default_meal_ingredients di
		     WHERE di.meal_id = seed.id
		       AND NOT EXISTS (
		         SELECT 1 FROM foods f WHERE f.tenant_id = $1 AND f.source_seed_id = di.food_id
		       )
		   )
		 ON CONFLICT (tenant_id, name) DO NOTHING
		 RETURNING id`,
		[tenantId, coachId],
	);

	if (createdMeals.length > 0) {
		await manager.query(
			`INSERT INTO meal_ingredients (meal_id, food_id, amount, position)
			 SELECT m.id, f.id, di.amount, di.position
			 FROM meals m
			 JOIN default_meal_ingredients di ON di.meal_id = m.source_seed_id
			 JOIN foods f ON f.tenant_id = m.tenant_id AND f.source_seed_id = di.food_id
			 WHERE m.id = ANY($1::uuid[])`,
			[createdMeals.map((r) => r.id)],
		);
	}
}

async function seedCoachAndTenant(
	manager: EntityManager,
	passwordHash: string,
	index: number,
): Promise<SeededTenant> {
	const isMale = index % 2 === 0;
	const firstName = pick(isMale ? MALE_NAMES : FEMALE_NAMES);
	const lastName = pick(LAST_NAMES);
	const specialties = pickMany(Object.values(CoachSpecialty), randInt(2, 4));

	const coach = manager.create(Coach, {
		email: `coach${index}@${DEMO_EMAIL_DOMAIN}`,
		password: passwordHash,
		firstName,
		lastName,
		bio: `${firstName} has helped dozens of clients build sustainable training and nutrition habits. Specializing in ${specialties[0].replace('_', ' ')}.`,
		age: randInt(26, 45),
		gender: isMale ? Gender.MALE : Gender.FEMALE,
		location: pick(CITIES),
		specialties,
		yearsExperience: randInt(2, 15),
		careerExperience: `${randInt(2, 15)} years coaching individuals and small groups, certified personal trainer.`,
		offlineAvailability: pick(Object.values(OfflineAvailability)),
		availabilityHours: 'Sun-Thu · 8 AM – 8 PM',
		priceFrom: randInt(30, 60) * 10,
		priceTo: randInt(70, 150) * 10,
		isEmailVerified: true,
	});
	const savedCoach = await manager.save(coach);

	const businessName = `${firstName} ${lastName} Coaching`;
	const tenant = manager.create(Tenant, {
		ownerCoach: savedCoach,
		name: businessName,
		slug: `${slugify(businessName)}-demo-${index}`,
		acceptingClients: true,
	});
	const savedTenant = await manager.save(tenant);

	await copyExerciseLibrary(manager, savedTenant.id);
	await copyNutritionLibrary(manager, savedTenant.id, savedCoach.id);

	const exercises = await manager.query(
		`SELECT id, name, category, primary_muscle, secondary_muscles, equipment,
		        demo_video_url, demo_gif_url, thumbnail_url, instruction_steps
		 FROM exercises WHERE tenant_id = $1`,
		[savedTenant.id],
	);
	const meals = await manager.query(
		`SELECT id, name, dietary_tags, allergens FROM meals WHERE tenant_id = $1`,
		[savedTenant.id],
	);
	const mealIngredients = new Map<string, any[]>();
	for (const meal of meals) {
		const ingredients = await manager.query(
			`SELECT mi.food_id, mi.amount, mi.position,
			        f.name, f.brand, f.serving_size, f.serving_unit,
			        f.calories, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g
			 FROM meal_ingredients mi
			 JOIN foods f ON f.id = mi.food_id
			 WHERE mi.meal_id = $1
			 ORDER BY mi.position`,
			[meal.id],
		);
		mealIngredients.set(meal.id, ingredients);
	}

	return {
		coach: savedCoach,
		tenant: savedTenant,
		exercises,
		meals,
		mealIngredients,
	};
}

interface SeededClient {
	client: Client;
	membership: ClientMembership;
	tenantInfo: SeededTenant;
}

async function seedClientForTenant(
	manager: EntityManager,
	passwordHash: string,
	index: number,
	tenantInfo: SeededTenant,
): Promise<SeededClient> {
	const isMale = index % 2 === 1;
	const firstName = pick(isMale ? MALE_NAMES : FEMALE_NAMES);
	const lastName = pick(LAST_NAMES);

	const client = manager.create(Client, {
		email: `client${index}@${DEMO_EMAIL_DOMAIN}`,
		password: passwordHash,
		firstName,
		lastName,
		timezone: 'Africa/Cairo',
		dateOfBirth: toDateStr(daysAgo(randInt(20, 45) * 365)),
		gender: isMale ? Gender.MALE : Gender.FEMALE,
		heightCm: randInt(155, 190),
		weightKg: randInt(55, 95),
		isEmailVerified: true,
	});
	const savedClient = await manager.save(client);

	const joinedAt = daysAgo(randInt(20, 150));
	const membership = manager.create(ClientMembership, {
		tenant: tenantInfo.tenant,
		client: savedClient,
		status: MembershipStatus.ACTIVE,
		monthlyPrice: randInt(30, 100) * 10,
		currency: 'EGP',
		joinedAt,
		lastActiveAt: daysAgo(randInt(0, 3)),
	});
	const savedMembership = await manager.save(membership);

	const intake = manager.create(ClientIntake, {
		tenant: tenantInfo.tenant,
		membership: savedMembership,
		goal: pick(Object.values(FitnessGoal)),
		activityLevel: pick(Object.values(ActivityLevel)),
		trainingExperience: pick(Object.values(TrainingExperience)),
		trainingDaysPerWeek: randInt(3, 6),
		focusAreas: pickMany(Object.values(FocusArea), randInt(1, 3)),
		trainingStyles: pickMany(Object.values(TrainingStyle), randInt(1, 2)),
		availableEquipment: pickMany(Object.values(EquipmentType), randInt(1, 3)),
		dietaryPreferences: pickMany(
			Object.values(DietaryPreference),
			randInt(1, 2),
		),
		notes: 'Seeded demo client — onboarded via demo-seed script.',
	});
	await manager.save(intake);

	const measurements: Measurement[] = [];
	const baseWeight = Number(savedClient.weightKg);
	for (let i = 0; i < 4; i++) {
		measurements.push(
			manager.create(Measurement, {
				tenant: tenantInfo.tenant,
				membership: savedMembership,
				measuredAt: toDateStr(daysAgo(i * 14)),
				weightKg:
					Math.round((baseWeight - i * 0.6 + randInt(-2, 2) * 0.1) * 10) / 10,
				bodyFatPct: randInt(150, 280) / 10,
				chestCm: randInt(85, 110),
				waistCm: randInt(70, 100),
				hipsCm: randInt(85, 110),
				armCm: randInt(25, 38),
				thighCm: randInt(45, 62),
			}),
		);
	}
	await manager.save(measurements);

	const checkins = [
		manager.create(Checkin, {
			tenant: tenantInfo.tenant,
			membership: savedMembership,
			scheduledFor: toDateStr(daysFromNow(7)),
			status: CheckinStatus.PENDING,
		}),
		manager.create(Checkin, {
			tenant: tenantInfo.tenant,
			membership: savedMembership,
			scheduledFor: toDateStr(daysAgo(7)),
			status: CheckinStatus.SUBMITTED,
			submittedAt: daysAgo(6),
			clientNotes: 'Felt strong this week, sleep was a bit inconsistent.',
			metrics: { mood: 8, energy: 7, sleep_hours: 6.5 },
		}),
		manager.create(Checkin, {
			tenant: tenantInfo.tenant,
			membership: savedMembership,
			scheduledFor: toDateStr(daysAgo(14)),
			status: CheckinStatus.REVIEWED,
			submittedAt: daysAgo(13),
			clientNotes: 'Struggled with the Wednesday session, otherwise on track.',
			metrics: { mood: 6, energy: 6, sleep_hours: 7 },
			reviewedAt: daysAgo(12),
			reviewer: tenantInfo.coach,
			coachFeedback:
				'Great consistency — let’s scale back Wednesday volume slightly.',
		}),
	];
	await manager.save(checkins);

	const chatBodies: Array<[ChatSender, string]> = [
		[ChatSender.CLIENT, 'Hey! Quick question about today’s session.'],
		[ChatSender.COACH, 'Sure, what’s up?'],
		[ChatSender.CLIENT, 'Should I go heavier on the last set?'],
		[
			ChatSender.COACH,
			'If form holds, yes — add 2.5kg and stop 1 rep shy of failure.',
		],
		[ChatSender.CLIENT, 'Got it, thanks!'],
	];
	const chatMessages = chatBodies.map(([senderType, body], i) =>
		manager.create(ChatMessage, {
			tenantId: tenantInfo.tenant.id,
			clientId: savedClient.id,
			senderType,
			body,
			readAt: i < chatBodies.length - 1 ? daysAgo(randInt(1, 5)) : null,
			createdAt: daysAgo(randInt(1, 5)),
		}),
	);
	await manager.save(chatMessages);

	if (index % 2 === 0) {
		const review = manager.create(Review, {
			tenant: tenantInfo.tenant,
			client: savedClient,
			rating: randInt(4, 5),
			comment:
				'Fantastic coach — programs are well structured and always adjusted to how I feel.',
		});
		await manager.save(review);
	}

	return { client: savedClient, membership: savedMembership, tenantInfo };
}

async function seedProgramForClient(
	manager: EntityManager,
	seeded: SeededClient,
) {
	const { tenantInfo, membership } = seeded;
	if (tenantInfo.exercises.length === 0) return null;

	const startDate = daysAgo(3);
	const endDate = daysFromNow(3); // duration_weeks=1 → end = start + 6

	const program = manager.create(Program, {
		tenant: tenantInfo.tenant,
		createdBy: tenantInfo.coach,
		programType: ProgramType.CLIENT,
		membership,
		name: `${seeded.client.firstName}'s Training Program`,
		description: 'Seeded demo program — balanced full-body split.',
		goal: pick(Object.values(FitnessGoal)),
		difficulty: pick(Object.values(DifficultyLevel)),
		durationWeeks: 1,
		startDate: toDateStr(startDate),
		endDate: toDateStr(endDate),
		status: ProgramStatus.PUBLISHED,
		weeks: [
			{
				tenant: tenantInfo.tenant,
				weekNumber: 1,
				days: Array.from({ length: 7 }, (_, i) => ({
					tenant: tenantInfo.tenant,
					dayNumber: i + 1,
					name: i % 3 === 2 ? 'Rest Day' : `Training Day ${i + 1}`,
					isRestDay: i % 3 === 2,
				})),
			},
		],
	});
	const savedProgram = await manager.save(program);

	const days = savedProgram.weeks[0].days;
	for (const day of days) {
		if (day.isRestDay) continue;
		const chosenExercises = pickMany(
			tenantInfo.exercises,
			Math.min(3, tenantInfo.exercises.length),
		);
		const plannedExercises: Array<Record<string, unknown>> =
			chosenExercises.map((ex, position) => ({
				tenant: tenantInfo.tenant,
				programDay: day,
				exercise: { id: ex.id },
				exerciseName: ex.name,
				category: ex.category,
				primaryMuscle: ex.primary_muscle,
				secondaryMuscles: ex.secondary_muscles ?? [],
				equipment: ex.equipment ?? [],
				demoVideoUrl: ex.demo_video_url,
				demoGifUrl: ex.demo_gif_url,
				thumbnailUrl: ex.thumbnail_url,
				instructionSteps: ex.instruction_steps ?? [],
				position: position + 1,
				restSeconds: 90,
				sets: Array.from({ length: 3 }, (_, s) => ({
					setNumber: s + 1,
					setType: SetType.WORKING,
					repsMin: 8,
					repsMax: 12,
					weightKg: randInt(10, 40),
				})),
			}));
		await manager.save(
			PlannedExercise,
			plannedExercises as unknown as PlannedExercise[],
		);
	}

	return savedProgram;
}

async function seedNutritionPlanForClient(
	manager: EntityManager,
	seeded: SeededClient,
) {
	const { tenantInfo, membership } = seeded;
	if (tenantInfo.meals.length === 0) return null;

	const startDate = daysAgo(3);
	const endDate = daysFromNow(3);

	const plan = manager.create(NutritionPlan, {
		tenant: tenantInfo.tenant,
		createdBy: tenantInfo.coach,
		planType: NutritionPlanType.CLIENT,
		membership,
		name: `${seeded.client.firstName}'s Nutrition Plan`,
		description: 'Seeded demo nutrition plan.',
		goal: pick(Object.values(FitnessGoal)),
		durationWeeks: 1,
		startDate: toDateStr(startDate),
		endDate: toDateStr(endDate),
		targetCalories: randInt(1800, 2600),
		targetProteinG: randInt(120, 180),
		targetCarbsG: randInt(150, 300),
		targetFatG: randInt(50, 90),
		targetFiberG: randInt(20, 35),
		targetWaterMl: 2500,
		status: NutritionPlanStatus.PUBLISHED,
		weeks: [
			{
				tenant: tenantInfo.tenant,
				weekNumber: 1,
				days: Array.from({ length: 7 }, (_, i) => ({
					tenant: tenantInfo.tenant,
					dayNumber: i + 1,
				})),
			},
		],
	});
	const savedPlan = await manager.save(plan);

	const days = savedPlan.weeks[0].days;
	const slots = [MealSlot.BREAKFAST, MealSlot.LUNCH, MealSlot.DINNER];
	for (const day of days) {
		const chosenMeals = pickMany(
			tenantInfo.meals,
			Math.min(3, tenantInfo.meals.length),
		);
		const plannedMeals: Array<Record<string, unknown>> = chosenMeals.map(
			(meal, position) => {
				const ingredients = tenantInfo.mealIngredients.get(meal.id) ?? [];
				return {
					tenant: tenantInfo.tenant,
					nutritionPlanDay: day,
					sourceMeal: { id: meal.id },
					mealName: meal.name,
					dietaryTags: meal.dietary_tags ?? [],
					allergens: meal.allergens ?? [],
					slot: slots[position] ?? MealSlot.SNACK,
					position: position + 1,
					foods: ingredients.map((ing, fPos) => ({
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
						position: fPos + 1,
					})),
				};
			},
		);
		await manager.save(PlannedMeal, plannedMeals as unknown as PlannedMeal[]);
	}

	return savedPlan;
}

async function seedTrainingHistory(
	manager: EntityManager,
	seeded: SeededClient,
	program: Program,
) {
	const activeDays = program.weeks[0].days
		.filter((d) => !d.isRestDay)
		.slice(0, 2);
	for (const day of activeDays) {
		const plannedExercises = await manager.find(PlannedExercise, {
			where: { programDayId: day.id },
			relations: { sets: true },
			order: { position: 'ASC' },
		});
		if (plannedExercises.length === 0) continue;

		const scheduledDate = daysAgo(randInt(1, 3));
		const workout = manager.create(LoggedWorkout, {
			tenant: seeded.tenantInfo.tenant,
			membership: seeded.membership,
			program,
			programDay: day,
			scheduledDate: toDateStr(scheduledDate),
			startedAt: scheduledDate,
			completedAt: new Date(scheduledDate.getTime() + 45 * 60 * 1000),
			durationMinutes: 45,
			status: SessionStatus.COMPLETED,
			overallRpe: randInt(60, 90) / 10,
			exercises: plannedExercises.map((pe) => ({
				plannedExercise: pe,
				exercise: { id: pe.exerciseId } as any,
				exerciseName: pe.exerciseName,
				position: pe.position,
				sets: pe.sets.map((ps) => ({
					plannedSet: ps,
					setNumber: ps.setNumber,
					isExtra: false,
					prescribedSetType: ps.setType,
					prescribedRepsMin: ps.repsMin,
					prescribedRepsMax: ps.repsMax,
					prescribedWeightKg: ps.weightKg,
					reps: (ps.repsMin ?? 8) + 1,
					weightKg: ps.weightKg,
					rpe: randInt(60, 85) / 10,
					outcome: SetOutcome.COMPLETED,
				})),
			})),
		});
		const savedWorkout = await manager.save(workout);

		await manager.save(
			manager.create(ActivityLog, {
				client: seeded.client,
				tenant: seeded.tenantInfo.tenant,
				membership: seeded.membership,
				activityType: ActivityType.WORKOUT_SET_REPORTED,
				sourceKey: savedWorkout.id,
				activityDate: toDateStr(scheduledDate),
				occurredAt: savedWorkout.completedAt!,
			}),
		);
	}
}

async function seedNutritionHistory(
	manager: EntityManager,
	seeded: SeededClient,
	plan: NutritionPlan,
) {
	const days = plan.weeks[0].days.slice(0, 2);
	for (const day of days) {
		const plannedMeals = await manager.find(PlannedMeal, {
			where: { nutritionPlanDayId: day.id },
			relations: { foods: true },
			order: { position: 'ASC' },
		});
		if (plannedMeals.length === 0) continue;

		const scheduledDate = daysAgo(randInt(1, 3));
		const dayLog = manager.create(NutritionDayLog, {
			tenant: seeded.tenantInfo.tenant,
			membership: seeded.membership,
			nutritionPlan: plan,
			nutritionPlanDay: day,
			scheduledDate: toDateStr(scheduledDate),
			status: NutritionLogStatus.FINALIZED,
			adherenceOutcome: NutritionAdherenceOutcome.COMPLETED,
			waterMlConsumed: randInt(1800, 2800),
			startedAt: scheduledDate,
			completedAt: new Date(scheduledDate.getTime() + 12 * 60 * 60 * 1000),
			meals: plannedMeals.map((pm) => {
				const totals = pm.foods.reduce(
					(acc, f) => ({
						calories: acc.calories + Number(f.caloriesPerServing),
						protein: acc.protein + Number(f.proteinGPerServing),
						carbs: acc.carbs + Number(f.carbsGPerServing),
						fat: acc.fat + Number(f.fatGPerServing),
						fiber: acc.fiber + Number(f.fiberGPerServing ?? 0),
					}),
					{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
				);
				return {
					plannedMeal: pm,
					sourceMeal: pm.sourceMealId
						? ({ id: pm.sourceMealId } as any)
						: undefined,
					mealName: pm.mealName,
					slot: pm.slot,
					position: pm.position,
					prescribedCalories: totals.calories || 1,
					prescribedProteinG: totals.protein,
					prescribedCarbsG: totals.carbs,
					prescribedFatG: totals.fat,
					prescribedFiberG: totals.fiber,
					outcome: NutritionAdherenceOutcome.COMPLETED,
				};
			}),
		});
		const savedLog = await manager.save(dayLog);

		await manager.save(
			manager.create(ActivityLog, {
				client: seeded.client,
				tenant: seeded.tenantInfo.tenant,
				membership: seeded.membership,
				activityType: ActivityType.NUTRITION_MEAL_REPORTED,
				sourceKey: savedLog.id,
				activityDate: toDateStr(scheduledDate),
				occurredAt: savedLog.completedAt!,
			}),
		);
	}
}

async function seedInvitations(
	manager: EntityManager,
	tenants: SeededTenant[],
) {
	const invitations = tenants.slice(0, 3).map((t, i) =>
		manager.create(Invitation, {
			email: `pending-invite-${i + 1}@${DEMO_EMAIL_DOMAIN}`,
			clientName: `${pick(MALE_NAMES)} ${pick(LAST_NAMES)}`,
			status: InvitaionStatusEnum.PENDING,
			token: randomUUID(),
			expiresAt: daysFromNow(7),
			sender: t.coach,
			tenant: t.tenant,
		}),
	);
	await manager.save(invitations);
}

async function main() {
	await AppDataSource.initialize();

	const firstEmail = `coach1@${DEMO_EMAIL_DOMAIN}`;
	const existing = await AppDataSource.getRepository(Coach).findOne({
		where: { email: firstEmail },
		select: { id: true },
	});
	if (existing) {
		console.log(
			`Demo data already present (found ${firstEmail}) — nothing to do.`,
		);
		await AppDataSource.destroy();
		return;
	}

	const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
	const coachEmails: string[] = [];
	const clientEmails: string[] = [];
	const counts: Record<string, number> = {};

	await AppDataSource.transaction(async (manager) => {
		const tenants: SeededTenant[] = [];
		for (let i = 1; i <= COACH_COUNT; i++) {
			const t = await seedCoachAndTenant(manager, passwordHash, i);
			tenants.push(t);
			coachEmails.push(t.coach.email);
		}
		counts.coaches = tenants.length;
		counts.tenants = tenants.length;

		// Distribute clients round-robin across coaches
		const seededClients: SeededClient[] = [];
		for (let i = 1; i <= CLIENT_COUNT; i++) {
			const tenantInfo = tenants[(i - 1) % tenants.length];
			const sc = await seedClientForTenant(
				manager,
				passwordHash,
				i,
				tenantInfo,
			);
			seededClients.push(sc);
			clientEmails.push(sc.client.email);
		}
		counts.clients = seededClients.length;
		counts.memberships = seededClients.length;

		// 2 programs + 2 nutrition plans per coach, spread across that coach's clients
		let programCount = 0;
		let planCount = 0;
		let loggedWorkoutClients = 0;
		let loggedNutritionClients = 0;
		for (const tenantInfo of tenants) {
			const clientsForTenant = seededClients.filter(
				(sc) => sc.tenantInfo.tenant.id === tenantInfo.tenant.id,
			);
			const forPrograms = clientsForTenant.slice(0, 2);
			for (const sc of forPrograms) {
				const program = await seedProgramForClient(manager, sc);
				if (program) programCount++;
				const plan = await seedNutritionPlanForClient(manager, sc);
				if (plan) planCount++;

				if (sc === forPrograms[0]) {
					if (program) {
						await seedTrainingHistory(manager, sc, program);
						loggedWorkoutClients++;
					}
					if (plan) {
						await seedNutritionHistory(manager, sc, plan);
						loggedNutritionClients++;
					}
				}
			}
		}
		counts.programs = programCount;
		counts.nutrition_plans = planCount;
		counts.clients_with_logged_workouts = loggedWorkoutClients;
		counts.clients_with_logged_nutrition = loggedNutritionClients;

		await seedInvitations(manager, tenants);
		counts.invitations = Math.min(3, tenants.length);
	});

	console.log('\n================ DEMO DATA SEEDED ================');
	console.log(`Shared password for every account below: ${DEMO_PASSWORD}\n`);
	console.log(`Coaches (${coachEmails.length}):`);
	coachEmails.forEach((e) => console.log(`  ${e}`));
	console.log(`\nClients (${clientEmails.length}):`);
	clientEmails.forEach((e) => console.log(`  ${e}`));
	console.log('\nRow counts (this run):');
	Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
	console.log('====================================================\n');

	await AppDataSource.destroy();
}

main().catch(async (err) => {
	console.error('demo-seed failed:', err);
	try {
		await AppDataSource.destroy();
	} catch {
		/* already closed */
	}
	process.exit(1);
});
