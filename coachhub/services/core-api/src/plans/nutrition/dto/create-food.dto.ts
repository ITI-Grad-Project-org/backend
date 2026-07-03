import {
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
}                                           from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ServingUnit }                      from 'src/common';

export class CreateFoodDto {
	@ApiProperty( { example: 'Chicken breast, grilled' } )
	@IsString()
	@IsNotEmpty()
	@MaxLength( 150 )
	name: string;

	@ApiPropertyOptional( { example: 'Local farm' } )
	@IsOptional()
	@IsString()
	@MaxLength( 100 )
	brand?: string;

	@ApiPropertyOptional( { example: 100, default: 100 } )
	@IsOptional()
	@IsNumber()
	@Min( 0.1 )
	servingSize?: number;

	@ApiPropertyOptional( { enum: ServingUnit, default: ServingUnit.G } )
	@IsOptional()
	@IsEnum( ServingUnit )
	servingUnit?: ServingUnit;

	@ApiProperty( { example: 165 } )
	@IsNumber()
	@Min( 0 )
	calories: number;

	@ApiPropertyOptional( { example: 31, default: 0 } )
	@IsOptional()
	@IsNumber()
	@Min( 0 )
	proteinG?: number;

	@ApiPropertyOptional( { example: 0, default: 0 } )
	@IsOptional()
	@IsNumber()
	@Min( 0 )
	carbsG?: number;

	@ApiPropertyOptional( { example: 3.6, default: 0 } )
	@IsOptional()
	@IsNumber()
	@Min( 0 )
	fatG?: number;

	@ApiPropertyOptional( { example: 0 } )
	@IsOptional()
	@IsNumber()
	@Min( 0 )
	fiberG?: number;
}

export class UpdateFoodDto extends PartialType( CreateFoodDto ) {}
