import { ApiProperty } from '@nestjs/swagger';
import {
	MealSlot,
	NutritionAdherenceOutcome,
	NutritionLogStatus,
	ServingUnit,
} from '../../../common';
import {
	ClientNutritionNutrientsResponseDto,
	ClientPlannedFoodResponseDto,
} from './client-nutrition-response.dto';

export class ActualNutritionTotalsResponseDto {
	@ApiProperty({ nullable: true, example: 430 })
	calories: number | null;

	@ApiProperty({ nullable: true, example: 32 })
	proteinG: number | null;

	@ApiProperty({ nullable: true, example: 45 })
	carbsG: number | null;

	@ApiProperty({ nullable: true, example: 14 })
	fatG: number | null;

	@ApiProperty({ nullable: true, example: 6 })
	fiberG: number | null;
}

export class ClientActualFoodLogResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid', nullable: true })
	loggedMealId: string | null;

	@ApiProperty({ format: 'uuid', nullable: true })
	foodId: string | null;

	@ApiProperty({ enum: ['library', 'manual'] })
	source: 'library' | 'manual';

	@ApiProperty({ enum: MealSlot })
	mealSlot: MealSlot;

	@ApiProperty()
	foodName: string;

	@ApiProperty({ nullable: true })
	brand: string | null;

	@ApiProperty({ nullable: true })
	servingSize: number | null;

	@ApiProperty({ enum: ServingUnit, nullable: true })
	servingUnit: ServingUnit | null;

	@ApiProperty({ nullable: true })
	amount: number | null;

	@ApiProperty({ type: () => ActualNutritionTotalsResponseDto })
	nutrients: ActualNutritionTotalsResponseDto;

	@ApiProperty({ nullable: true })
	clientNotes: string | null;

	@ApiProperty({ format: 'date-time' })
	loggedAt: Date;

	@ApiProperty({ format: 'date-time' })
	createdAt: Date;

	@ApiProperty({ format: 'date-time' })
	updatedAt: Date;
}

export class ClientLoggedMealResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	plannedMealId: string;

	@ApiProperty({ format: 'uuid' })
	sourceMealId: string;

	@ApiProperty({ example: 'Breakfast' })
	mealName: string;

	@ApiProperty({ enum: MealSlot })
	slot: MealSlot;

	@ApiProperty({ example: 1 })
	position: number;

	@ApiProperty({ type: () => ClientNutritionNutrientsResponseDto })
	prescribedTotals: ClientNutritionNutrientsResponseDto;

	@ApiProperty({ enum: NutritionAdherenceOutcome })
	outcome: NutritionAdherenceOutcome;

	@ApiProperty({ nullable: true })
	clientNotes: string | null;

	@ApiProperty({ type: () => ActualNutritionTotalsResponseDto })
	actualTotals: ActualNutritionTotalsResponseDto;

	@ApiProperty({
		type: () => ClientPlannedFoodResponseDto,
		isArray: true,
		description:
			'Immutable prescribed Food detail read from the planned Meal snapshot',
	})
	plannedFoods: ClientPlannedFoodResponseDto[];
}

export class ClientNutritionDayLogDetailResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	nutritionPlanId: string;

	@ApiProperty({ format: 'uuid' })
	nutritionPlanDayId: string;

	@ApiProperty({ format: 'date', example: '2026-07-26' })
	scheduledDate: string;

	@ApiProperty({ enum: NutritionLogStatus })
	status: NutritionLogStatus;

	@ApiProperty({
		enum: [
			'in_progress',
			'incomplete',
			'completed',
			'partial',
			'skipped',
			'not_applicable',
		],
	})
	logState:
		| 'in_progress'
		| 'incomplete'
		| 'completed'
		| 'partial'
		| 'skipped'
		| 'not_applicable';

	@ApiProperty({ enum: NutritionAdherenceOutcome, nullable: true })
	adherenceOutcome: NutritionAdherenceOutcome | null;

	@ApiProperty({ nullable: true, example: 2200 })
	waterMlConsumed: number | null;

	@ApiProperty({ nullable: true })
	clientNotes: string | null;

	@ApiProperty({ format: 'date-time' })
	startedAt: Date;

	@ApiProperty({ format: 'date-time', nullable: true })
	completedAt: Date | null;

	@ApiProperty()
	isRetrospective: boolean;

	@ApiProperty()
	isWritable: boolean;

	@ApiProperty({ type: () => ActualNutritionTotalsResponseDto })
	actualTotals: ActualNutritionTotalsResponseDto;

	@ApiProperty({ type: () => ClientActualFoodLogResponseDto, isArray: true })
	actualFoods: ClientActualFoodLogResponseDto[];

	@ApiProperty({ type: () => ClientLoggedMealResponseDto, isArray: true })
	meals: ClientLoggedMealResponseDto[];
}
