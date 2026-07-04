import {
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealSlot } from 'src/common';

export class ItemOverrideDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	foodId: string;

	@ApiProperty({
		example: 2,
		description: '0 = remove this item for this plan',
	})
	@IsNumber()
	@Min(0)
	quantity: number;
}

/**
 * Design §7.6 — THE DROP POPUP for meals. The drop target day is in the
 * route (POST /meal-plans/:planId/days/:mealPlanDayId/meals). The service
 * loads the library meal's items, applies overrides, and inserts
 * plan_meals (name copied, source_meal_id set) + plan_meal_items in one
 * transaction: copy-on-drop.
 */
export class AddMealToPlanDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	mealLibraryId: string;

	@ApiProperty({ enum: MealSlot, example: MealSlot.LUNCH })
	@IsEnum(MealSlot)
	slot: MealSlot;

	// popup fields
	@ApiProperty({ example: 1, minimum: 0.25, maximum: 10, default: 1 })
	@IsNumber()
	@Min(0.25)
	@Max(10)
	servings: number;

	@ApiPropertyOptional({
		type: [ItemOverrideDto],
		description: 'Tweak individual quantities at drop time',
	})
	@IsOptional()
	@ValidateNested({ each: true })
	@Type(() => ItemOverrideDto)
	itemOverrides?: ItemOverrideDto[];

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	coachNotes?: string;
}
