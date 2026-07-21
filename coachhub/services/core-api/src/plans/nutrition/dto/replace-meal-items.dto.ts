import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	ValidateNested,
} from 'class-validator';
import { MealItemDto } from './create-meal.dto';

export class ReplaceMealItemsDto {
	@ApiProperty({ type: [MealItemDto], minItems: 1, maxItems: 100 })
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(100)
	@ValidateNested({ each: true })
	@Type(() => MealItemDto)
	items: MealItemDto[];
}
