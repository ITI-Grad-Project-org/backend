import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsBoolean,
	IsEnum,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
} from 'class-validator';
import { DietaryPreference, ServingUnit } from '../../../common';

export class QueryFoodsDto {
	@ApiPropertyOptional({
		description: 'Case-insensitive name or brand search',
	})
	@IsOptional()
	@IsString()
	@MaxLength(150)
	search?: string;

	@ApiPropertyOptional({ enum: ServingUnit })
	@IsOptional()
	@IsEnum(ServingUnit)
	servingUnit?: ServingUnit;

	@ApiPropertyOptional({ enum: DietaryPreference })
	@IsOptional()
	@IsEnum(DietaryPreference)
	dietaryTag?: DietaryPreference;

	@ApiPropertyOptional({ example: 'milk' })
	@IsOptional()
	@IsString()
	@Matches(/\S/, {
		message: 'allergen must contain a non-whitespace character',
	})
	@MaxLength(100)
	allergen?: string;

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@Transform(({ value }) => {
		if (value === true || value === 'true') return true;
		if (value === false || value === 'false') return false;
		return value;
	})
	@IsBoolean()
	includeInactive?: boolean;
}
