import {
	ArrayMinSize,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUrl,
	IsUUID,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
	ApiProperty,
	ApiPropertyOptional,
	OmitType,
	PartialType,
} from '@nestjs/swagger';

export class MealItemDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	foodId: string;

	@ApiProperty({ example: 1.5, description: "× the food's serving" })
	@IsNumber()
	@Min(0.1)
	quantity: number;
}

/** Design §7.5 → meal_library + meal_library_items. */
export class CreateMealDto {
	@ApiProperty({ example: 'Chicken & Rice Bowl' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	name: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	description?: string;

	@ApiPropertyOptional({ example: 'https://cdn.coachhub.app/meals/bowl.jpg' })
	@IsOptional()
	@IsUrl()
	photoUrl?: string;

	@ApiPropertyOptional({ description: 'Cooking/prep instructions' })
	@IsOptional()
	@IsString()
	prepNotes?: string;

	@ApiProperty({ type: [MealItemDto] })
	@ValidateNested({ each: true })
	@Type(() => MealItemDto)
	@ArrayMinSize(1)
	items: MealItemDto[];
}

export class UpdateMealDto extends PartialType(
	OmitType(CreateMealDto, ['items'] as const),
) {}
