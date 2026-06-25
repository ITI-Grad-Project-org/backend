import {
	IsEmail,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	MinLength,
	Validate,
}                                           from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MatchConstraint }                  from 'src/common';
import { Type }                             from 'class-transformer';

export class CreateClientDto {
	@ApiProperty( { example: 'Alice Smith' } )
	@IsString()
	@IsNotEmpty()
	name: string;

	@ApiProperty( { example: 'alice@example.com' } )
	@IsEmail()
	@IsNotEmpty()
	email: string;

	@ApiProperty( { example: 'password123', minLength: 6 } )
	@IsString()
	@IsNotEmpty()
	@MinLength( 6 )
	password: string;

	@ApiProperty( { example: 'password123' } )
	@IsString()
	@IsNotEmpty()
	@Validate( MatchConstraint, [ 'password' ] )
	confirmPassword: string;

	@ApiPropertyOptional( { description: 'Tenant ID of the coach', example: 1 } )
	@IsOptional()
	@IsInt()
	@Type( () => Number )
	tenantId?: number;
}
