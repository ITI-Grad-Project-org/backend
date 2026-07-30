import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	DietaryPreference,
	FitnessGoal,
	MealSlot,
	MembershipStatus,
	NutritionAdherenceOutcome,
	NutritionLogStatus,
	NutritionPlanStatus,
	ServingUnit,
} from '../../../common';

const NULLABLE_NUMBER = {
	type: Number,
	nullable: true,
	example: 120,
} as const;

export class ClientNutritionApiErrorResponseDto {
	@ApiProperty({ example: 400 })
	statusCode: number;

	@ApiProperty({ example: 'Validation failed' })
	message: string;

	@ApiPropertyOptional({
		type: [String],
		example: ['Calendar range cannot exceed 366 inclusive calendar days'],
	})
	errors?: string[];

	@ApiProperty({
		example: '2026-07-26T12:00:00.000Z',
		format: 'date-time',
	})
	timestamp: string;

	@ApiProperty({
		example: '/client/me/nutrition/calendar?from=2026-02-01&to=2027-02-02',
	})
	path: string;
}

export class ClientNutritionMembershipClientResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty()
	firstName: string;

	@ApiProperty()
	lastName: string;

	@ApiProperty({ format: 'email' })
	email: string;

	@ApiProperty({ nullable: true })
	avatarUrl: string | null;
}

export class ClientNutritionMembershipResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ enum: MembershipStatus })
	status: MembershipStatus;

	@ApiProperty({
		type: () => ClientNutritionMembershipClientResponseDto,
		nullable: true,
	})
	client: ClientNutritionMembershipClientResponseDto | null;
}

export class ClientNutritionTargetsResponseDto {
	@ApiProperty(NULLABLE_NUMBER)
	calories: number | null;

	@ApiProperty(NULLABLE_NUMBER)
	proteinG: number | null;

	@ApiProperty(NULLABLE_NUMBER)
	carbsG: number | null;

	@ApiProperty(NULLABLE_NUMBER)
	fatG: number | null;

	@ApiProperty(NULLABLE_NUMBER)
	fiberG: number | null;

	@ApiProperty({ ...NULLABLE_NUMBER, example: 2500 })
	waterMl: number | null;
}

export class ClientNutritionNutrientsResponseDto {
	@ApiProperty({ example: 520 })
	calories: number;

	@ApiProperty({ example: 42 })
	proteinG: number;

	@ApiProperty({ example: 58 })
	carbsG: number;

	@ApiProperty({ example: 14 })
	fatG: number;

	@ApiProperty({ ...NULLABLE_NUMBER, example: 8 })
	fiberG: number | null;
}

export class ClientNutritionVarianceValueResponseDto {
	@ApiProperty(NULLABLE_NUMBER)
	target: number | null;

	@ApiProperty(NULLABLE_NUMBER)
	prescribed: number | null;

	@ApiProperty({ ...NULLABLE_NUMBER, example: -20 })
	absoluteDifference: number | null;

	@ApiProperty({ ...NULLABLE_NUMBER, example: -10 })
	percentageDifference: number | null;
}

export class ClientNutritionVarianceResponseDto {
	@ApiProperty({ type: () => ClientNutritionVarianceValueResponseDto })
	calories: ClientNutritionVarianceValueResponseDto;

	@ApiProperty({ type: () => ClientNutritionVarianceValueResponseDto })
	proteinG: ClientNutritionVarianceValueResponseDto;

	@ApiProperty({ type: () => ClientNutritionVarianceValueResponseDto })
	carbsG: ClientNutritionVarianceValueResponseDto;

	@ApiProperty({ type: () => ClientNutritionVarianceValueResponseDto })
	fatG: ClientNutritionVarianceValueResponseDto;

	@ApiProperty({ type: () => ClientNutritionVarianceValueResponseDto })
	fiberG: ClientNutritionVarianceValueResponseDto;
}

export class ClientDietaryProfileResponseDto {
	@ApiProperty({ enum: DietaryPreference, isArray: true })
	dietaryPreferences: DietaryPreference[];

	@ApiProperty({ type: [String], example: ['milk'] })
	allergies: string[];
}

export class ClientNutritionWarningResponseDto {
	@ApiProperty({
		enum: ['dietary_preference_mismatch', 'allergen_match'],
	})
	type: 'dietary_preference_mismatch' | 'allergen_match';

	@ApiProperty({ format: 'uuid' })
	dayId: string;

	@ApiProperty({ format: 'date', example: '2026-07-20' })
	scheduledDate: string;

	@ApiProperty({ format: 'uuid' })
	plannedMealId: string;

	@ApiProperty({ example: 'Breakfast' })
	mealName: string;

	@ApiPropertyOptional({ enum: DietaryPreference })
	preference?: DietaryPreference;

	@ApiPropertyOptional({ example: 'milk' })
	allergen?: string;

	@ApiProperty({
		example: 'Breakfast contains the declared allergen milk',
	})
	message: string;

	@ApiProperty({ example: true })
	advisory: boolean;
}

export class ClientPlannedFoodResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	sourceFoodId: string;

	@ApiProperty({ format: 'uuid', nullable: true })
	sourceMealIngredientId: string | null;

	@ApiProperty({ example: 1 })
	position: number;

	@ApiProperty({ example: 'Greek yogurt' })
	foodName: string;

	@ApiProperty({ nullable: true, example: 'Example brand' })
	brand: string | null;

	@ApiProperty({ example: 100 })
	servingSize: number;

	@ApiProperty({ enum: ServingUnit })
	servingUnit: ServingUnit;

	@ApiProperty({ example: 150 })
	amount: number;

	@ApiProperty({ type: () => ClientNutritionNutrientsResponseDto })
	nutrientsPerServing: ClientNutritionNutrientsResponseDto;

	@ApiProperty({ type: () => ClientNutritionNutrientsResponseDto })
	nutrients: ClientNutritionNutrientsResponseDto;
}

export class ClientPlannedMealResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	sourceMealId: string;

	@ApiProperty({ example: 'Breakfast' })
	mealName: string;

	@ApiProperty({ nullable: true })
	description: string | null;

	@ApiProperty({ nullable: true })
	photoUrl: string | null;

	@ApiProperty({ nullable: true })
	prepNotes: string | null;

	@ApiProperty({ enum: DietaryPreference, isArray: true })
	dietaryTags: DietaryPreference[];

	@ApiProperty({ type: [String] })
	allergens: string[];

	@ApiProperty({ enum: MealSlot })
	slot: MealSlot;

	@ApiProperty({ example: 1 })
	position: number;

	@ApiProperty({ nullable: true, example: '08:30' })
	suggestedTime: string | null;

	@ApiProperty({ nullable: true })
	coachNotes: string | null;

	@ApiProperty({ type: () => ClientPlannedFoodResponseDto, isArray: true })
	foods: ClientPlannedFoodResponseDto[];

	@ApiProperty({ type: () => ClientNutritionNutrientsResponseDto })
	totals: ClientNutritionNutrientsResponseDto;
}

export class ClientNutritionLogResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ enum: NutritionLogStatus })
	status: NutritionLogStatus;

	@ApiProperty({ enum: NutritionAdherenceOutcome, nullable: true })
	adherenceOutcome: NutritionAdherenceOutcome | null;

	@ApiProperty({ format: 'date-time' })
	startedAt: Date;

	@ApiProperty({ format: 'date-time', nullable: true })
	completedAt: Date | null;
}

export class ClientNutritionDayResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 1 })
	dayNumber: number;

	@ApiProperty({ format: 'date', example: '2026-07-20' })
	scheduledDate: string;

	@ApiProperty()
	isFlexibleDay: boolean;

	@ApiProperty({ type: () => ClientNutritionTargetsResponseDto })
	targetOverrides: ClientNutritionTargetsResponseDto;

	@ApiProperty({ type: () => ClientNutritionTargetsResponseDto })
	effectiveTargets: ClientNutritionTargetsResponseDto;

	@ApiProperty({ type: () => ClientNutritionNutrientsResponseDto })
	prescribedTotals: ClientNutritionNutrientsResponseDto;

	@ApiProperty({ type: () => ClientNutritionVarianceResponseDto })
	variance: ClientNutritionVarianceResponseDto;

	@ApiProperty({ nullable: true })
	notes: string | null;

	@ApiProperty({ type: () => ClientNutritionWarningResponseDto, isArray: true })
	warnings: ClientNutritionWarningResponseDto[];

	@ApiProperty({ type: () => ClientPlannedMealResponseDto, isArray: true })
	meals: ClientPlannedMealResponseDto[];

	@ApiProperty({
		enum: [
			'not_started',
			'in_progress',
			'incomplete',
			'completed',
			'partial',
			'skipped',
			'not_applicable',
		],
	})
	logState:
		| 'not_started'
		| 'in_progress'
		| 'incomplete'
		| 'completed'
		| 'partial'
		| 'skipped'
		| 'not_applicable';

	@ApiProperty()
	isRetrospective: boolean;

	@ApiProperty({
		type: () => ClientNutritionLogResponseDto,
		nullable: true,
	})
	nutritionLog: ClientNutritionLogResponseDto | null;
}

export class ClientNutritionWeekResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 1 })
	weekNumber: number;

	@ApiProperty({ nullable: true })
	notes: string | null;

	@ApiProperty({ type: () => ClientNutritionDayResponseDto, isArray: true })
	days: ClientNutritionDayResponseDto[];
}

export class ClientNutritionPlanSummaryResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	membershipId: string;

	@ApiProperty({
		type: () => ClientNutritionMembershipResponseDto,
		nullable: true,
		description:
			'Membership summary when loaded by the response query; otherwise null.',
	})
	membership: ClientNutritionMembershipResponseDto | null;

	@ApiProperty({ example: 'Fat-loss nutrition plan' })
	name: string;

	@ApiProperty({ nullable: true })
	description: string | null;

	@ApiProperty({ enum: FitnessGoal, nullable: true })
	goal: FitnessGoal | null;

	@ApiProperty({ example: 8 })
	durationWeeks: number;

	@ApiProperty({ format: 'date', example: '2026-07-20' })
	startDate: string;

	@ApiProperty({ format: 'date', example: '2026-09-13' })
	endDate: string;

	@ApiProperty({ type: () => ClientNutritionTargetsResponseDto })
	targets: ClientNutritionTargetsResponseDto;

	@ApiProperty({ enum: NutritionPlanStatus, example: 'published' })
	status: NutritionPlanStatus;

	@ApiProperty({ enum: ['scheduled', 'active', 'ended'] })
	schedulePhase: 'scheduled' | 'active' | 'ended';

	@ApiProperty({ format: 'date-time' })
	createdAt: Date;

	@ApiProperty({ format: 'date-time' })
	updatedAt: Date;
}

export class ClientNutritionPlanResponseDto extends ClientNutritionPlanSummaryResponseDto {
	@ApiProperty({ type: () => ClientDietaryProfileResponseDto })
	clientDietaryProfile: ClientDietaryProfileResponseDto;

	@ApiProperty({
		example:
			'Dietary and allergen warnings are advisory and cannot guarantee medical safety.',
	})
	dietaryAdvisoryNotice: string;

	@ApiProperty({ type: () => ClientNutritionWarningResponseDto, isArray: true })
	warnings: ClientNutritionWarningResponseDto[];

	@ApiProperty({ type: () => ClientNutritionWeekResponseDto, isArray: true })
	weeks: ClientNutritionWeekResponseDto[];
}

export class ClientCurrentNutritionPlanResponseDto extends ClientNutritionPlanResponseDto {
	@ApiProperty({
		type: () => ClientNutritionDayResponseDto,
		nullable: true,
		description:
			'The prescribed day matching today in the tenant timezone, or null when the plan has no matching day.',
	})
	currentDay: ClientNutritionDayResponseDto | null;
}

export class ClientNutritionCalendarItemResponseDto extends ClientNutritionDayResponseDto {
	@ApiProperty({ format: 'uuid' })
	planId: string;

	@ApiProperty()
	planName: string;

	@ApiProperty({ enum: ['scheduled', 'active', 'ended'] })
	planSchedulePhase: 'scheduled' | 'active' | 'ended';

	@ApiProperty()
	dietaryAdvisoryNotice: string;

	@ApiProperty({ example: 1 })
	weekNumber: number;
}

export class ClientNutritionDayDetailResponseDto extends ClientNutritionCalendarItemResponseDto {
	@ApiProperty({ type: () => ClientDietaryProfileResponseDto })
	clientDietaryProfile: ClientDietaryProfileResponseDto;
}

export class ClientFoodResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty()
	name: string;

	@ApiProperty({ nullable: true })
	brand: string | null;

	@ApiProperty()
	servingSize: number;

	@ApiProperty({ enum: ServingUnit })
	servingUnit: ServingUnit;

	@ApiProperty()
	calories: number;

	@ApiProperty()
	proteinG: number;

	@ApiProperty()
	carbsG: number;

	@ApiProperty()
	fatG: number;

	@ApiProperty({ nullable: true })
	fiberG: number | null;

	@ApiProperty({ enum: DietaryPreference, isArray: true })
	dietaryTags: DietaryPreference[];

	@ApiProperty({ type: [String] })
	allergens: string[];

	@ApiProperty({ example: true })
	isActive: boolean;

	@ApiProperty({ format: 'date-time' })
	createdAt: Date;

	@ApiProperty({ format: 'date-time' })
	updatedAt: Date;
}
