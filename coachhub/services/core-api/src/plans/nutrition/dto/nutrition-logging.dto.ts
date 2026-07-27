import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';
import {
	MealSlot,
	NutritionAdherenceOutcome,
	NutritionLogStatus,
} from '../../../common';
import {
	ClientNutritionNutrientsResponseDto,
	ClientPlannedFoodResponseDto,
} from './client-nutrition-response.dto';

const SUBMITTED_MEAL_OUTCOMES = [
	NutritionAdherenceOutcome.COMPLETED,
	NutritionAdherenceOutcome.PARTIAL,
	NutritionAdherenceOutcome.SKIPPED,
];

export class UpdateNutritionDayLogDto {
	@ApiPropertyOptional({
		example: 2200,
		nullable: true,
		minimum: 0,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	waterMlConsumed?: number | null;

	@ApiPropertyOptional({
		example: 'Felt full throughout the day',
		nullable: true,
		maxLength: 5000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	clientNotes?: string | null;
}

export class UpdateLoggedMealOutcomeDto {
	@ApiProperty({ enum: SUBMITTED_MEAL_OUTCOMES })
	@IsIn(SUBMITTED_MEAL_OUTCOMES)
	outcome: NutritionAdherenceOutcome;

	@ApiPropertyOptional({
		example: 'Ate a smaller portion than prescribed',
		nullable: true,
		maxLength: 5000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	clientNotes?: string | null;
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

	@ApiProperty({ type: () => ClientLoggedMealResponseDto, isArray: true })
	meals: ClientLoggedMealResponseDto[];
}
