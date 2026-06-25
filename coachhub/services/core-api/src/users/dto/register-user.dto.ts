import {
	IsEmail,
	IsNotEmpty,
	IsOptional,
	IsPhoneNumber,
	IsString,
	MinLength,
	Validate,
}                                           from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MatchConstraint }                  from 'src/common';

export class RegisterDto {
	@ApiProperty( { example: 'Jane Smith' } )
	@IsString()
	@IsNotEmpty()
	name: string;

	@ApiProperty( { example: 'jane@acme.com' } )
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

	@ApiProperty( { example: '+966500000000' } )
	@IsPhoneNumber()
	@IsNotEmpty()
	phoneNumber: string;

	@ApiPropertyOptional( { example: '+966500000000' } )
	@IsOptional()
	@IsPhoneNumber()
	whatsappNumber?: string;
}
