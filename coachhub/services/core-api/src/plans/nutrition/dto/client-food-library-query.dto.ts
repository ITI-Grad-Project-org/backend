import { ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsEnum,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
} from 'class-validator';
import { DietaryPreference, ServingUnit } from '../../../common';

/** Client Food reads deliberately omit includeInactive. */
export class ClientFoodLibraryQueryDto {
	@ApiPropertyOptional({
		description:
			'Case-insensitive literal substring search against name or brand. SQL wildcard characters are treated as normal text. Whitespace-only input applies no search filter.',
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
}
