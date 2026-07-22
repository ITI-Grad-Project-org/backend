import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	ValidateNested,
} from 'class-validator';
import { MealItemDto } from './create-meal.dto';
import { MAX_MEAL_ITEMS } from '../utils/nutrition-validation.utils';

export class ReplaceMealItemsDto {
	@ApiProperty({
		type: [MealItemDto],
		minItems: 1,
		maxItems: MAX_MEAL_ITEMS,
	})
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(MAX_MEAL_ITEMS)
	@ValidateNested({ each: true })
	@Type(() => MealItemDto)
	items: MealItemDto[];
}
