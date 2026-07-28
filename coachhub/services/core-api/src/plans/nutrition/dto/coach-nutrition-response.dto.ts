import { ApiProperty } from '@nestjs/swagger';
import {
	DietaryPreference,
	FitnessGoal,
	NutritionPlanStatus,
	ServingUnit,
} from '../../../common';
import {
	ClientDietaryProfileResponseDto,
	ClientNutritionMembershipResponseDto,
	ClientNutritionNutrientsResponseDto,
	ClientNutritionTargetsResponseDto,
	ClientNutritionVarianceResponseDto,
	ClientNutritionWarningResponseDto,
	ClientPlannedMealResponseDto,
} from './client-nutrition-response.dto';

export class NutritionActionMessageResponseDto {
	@ApiProperty({ example: 'Client nutrition plan archived' })
	message: string;
}

export class CoachFoodResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	tenantId: string;

	@ApiProperty({ example: 'Greek yogurt' })
	name: string;

	@ApiProperty({ nullable: true, example: 'Example brand' })
	brand: string | null;

	@ApiProperty({ example: 100 })
	servingSize: number;

	@ApiProperty({ enum: ServingUnit })
	servingUnit: ServingUnit;

	@ApiProperty({ example: 120 })
	calories: number;

	@ApiProperty({ example: 10 })
	proteinG: number;

	@ApiProperty({ example: 8 })
	carbsG: number;

	@ApiProperty({ example: 4 })
	fatG: number;

	@ApiProperty({ nullable: true, example: 1 })
	fiberG: number | null;

	@ApiProperty({ enum: DietaryPreference, isArray: true })
	dietaryTags: DietaryPreference[];

	@ApiProperty({ type: [String], example: ['milk'] })
	allergens: string[];

	@ApiProperty({ example: true })
	isActive: boolean;

	@ApiProperty({ format: 'date-time' })
	createdAt: Date;

	@ApiProperty({ format: 'date-time' })
	updatedAt: Date;
}

export class CoachMealFoodResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Rolled oats' })
	name: string;

	@ApiProperty({ nullable: true, example: 'Example brand' })
	brand: string | null;

	@ApiProperty({ example: 100 })
	servingSize: number;

	@ApiProperty({ enum: ServingUnit })
	servingUnit: ServingUnit;

	@ApiProperty({ example: 389 })
	calories: number;

	@ApiProperty({ example: 16.9 })
	proteinG: number;

	@ApiProperty({ example: 66.3 })
	carbsG: number;

	@ApiProperty({ example: 6.9 })
	fatG: number;

	@ApiProperty({ nullable: true, example: 10.6 })
	fiberG: number | null;

	@ApiProperty({ enum: DietaryPreference, isArray: true })
	dietaryTags: DietaryPreference[];

	@ApiProperty({ type: [String] })
	allergens: string[];

	@ApiProperty()
	isActive: boolean;
}

export class CoachMealIngredientResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 1 })
	position: number;

	@ApiProperty({ example: 60 })
	amount: number;

	@ApiProperty({ enum: ServingUnit })
	servingUnit: ServingUnit;

	@ApiProperty({ type: () => CoachMealFoodResponseDto })
	food: CoachMealFoodResponseDto;

	@ApiProperty({ type: () => ClientNutritionNutrientsResponseDto })
	nutrients: ClientNutritionNutrientsResponseDto;
}

export class CoachMealResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Oats and yogurt breakfast' })
	name: string;

	@ApiProperty({ nullable: true })
	description: string | null;

	@ApiProperty({ nullable: true })
	photoUrl: string | null;

	@ApiProperty({ nullable: true })
	prepNotes: string | null;

	@ApiProperty({ enum: DietaryPreference, isArray: true })
	dietaryTags: DietaryPreference[];

	@ApiProperty({
		type: [String],
		description: 'Allergens entered directly on the Meal.',
	})
	additionalAllergens: string[];

	@ApiProperty({
		type: [String],
		description:
			'The combined unique allergens from the Meal and all of its Foods.',
	})
	effectiveAllergens: string[];

	@ApiProperty()
	isActive: boolean;

	@ApiProperty({ example: 2 })
	ingredientCount: number;

	@ApiProperty({ type: () => CoachMealIngredientResponseDto, isArray: true })
	ingredients: CoachMealIngredientResponseDto[];

	@ApiProperty({ type: () => ClientNutritionNutrientsResponseDto })
	totals: ClientNutritionNutrientsResponseDto;

	@ApiProperty({ format: 'date-time' })
	createdAt: Date;

	@ApiProperty({ format: 'date-time' })
	updatedAt: Date;
}

export class CoachNutritionDayResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 1 })
	dayNumber: number;

	@ApiProperty({ format: 'date', example: '2026-08-03' })
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
}

export class CoachNutritionWeekResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 1 })
	weekNumber: number;

	@ApiProperty({ nullable: true })
	notes: string | null;

	@ApiProperty({ type: () => CoachNutritionDayResponseDto, isArray: true })
	days: CoachNutritionDayResponseDto[];
}

export class CoachNutritionPlanSummaryResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	membershipId: string;

	@ApiProperty({
		type: () => ClientNutritionMembershipResponseDto,
		nullable: true,
	})
	membership: ClientNutritionMembershipResponseDto | null;

	@ApiProperty({ example: 'Eight-week fat-loss plan' })
	name: string;

	@ApiProperty({ nullable: true })
	description: string | null;

	@ApiProperty({ enum: FitnessGoal, nullable: true })
	goal: FitnessGoal | null;

	@ApiProperty({ example: 8 })
	durationWeeks: number;

	@ApiProperty({ format: 'date', example: '2026-08-03' })
	startDate: string;

	@ApiProperty({ format: 'date', example: '2026-09-27' })
	endDate: string;

	@ApiProperty({ type: () => ClientNutritionTargetsResponseDto })
	targets: ClientNutritionTargetsResponseDto;

	@ApiProperty({ enum: NutritionPlanStatus })
	status: NutritionPlanStatus;

	@ApiProperty({
		enum: ['scheduled', 'active', 'ended'],
		nullable: true,
		description:
			'Calculated timing state for a published plan. Draft and cancelled plans return null.',
	})
	schedulePhase: 'scheduled' | 'active' | 'ended' | null;

	@ApiProperty({
		description:
			'Whether the coach hid the plan from normal coach list results.',
	})
	isArchived: boolean;

	@ApiProperty({ format: 'date-time' })
	createdAt: Date;

	@ApiProperty({ format: 'date-time' })
	updatedAt: Date;
}

export class CoachNutritionPlanBuilderResponseDto extends CoachNutritionPlanSummaryResponseDto {
	@ApiProperty({ type: () => ClientDietaryProfileResponseDto })
	clientDietaryProfile: ClientDietaryProfileResponseDto;

	@ApiProperty({
		description:
			'Safety notice shown with dietary-preference and allergen warnings.',
	})
	dietaryAdvisoryNotice: string;

	@ApiProperty({ type: () => ClientNutritionWarningResponseDto, isArray: true })
	warnings: ClientNutritionWarningResponseDto[];

	@ApiProperty({ type: () => CoachNutritionWeekResponseDto, isArray: true })
	weeks: CoachNutritionWeekResponseDto[];
}

export class CreateLibraryMealAndAddResponseDto {
	@ApiProperty({ type: () => CoachMealResponseDto })
	meal: CoachMealResponseDto;

	@ApiProperty({ type: () => ClientPlannedMealResponseDto })
	plannedMeal: ClientPlannedMealResponseDto;
}

export class NutritionVarianceWarningResponseDto {
	@ApiProperty({ enum: ['target_variance'] })
	type: 'target_variance';

	@ApiProperty({ format: 'uuid' })
	dayId: string;

	@ApiProperty({ format: 'date', example: '2026-08-03' })
	scheduledDate: string;

	@ApiProperty({
		enum: ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG'],
	})
	nutrient: 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG';

	@ApiProperty({ example: 2000 })
	target: number;

	@ApiProperty({ example: 1650 })
	prescribed: number;

	@ApiProperty({ example: -350 })
	absoluteDifference: number;

	@ApiProperty({ nullable: true, example: -17.5 })
	percentageDifference: number | null;
}

export class PublishClientNutritionPlanResponseDto {
	@ApiProperty({ type: () => CoachNutritionPlanBuilderResponseDto })
	plan: CoachNutritionPlanBuilderResponseDto;

	@ApiProperty({
		type: () => NutritionVarianceWarningResponseDto,
		isArray: true,
	})
	varianceWarnings: NutritionVarianceWarningResponseDto[];
}
