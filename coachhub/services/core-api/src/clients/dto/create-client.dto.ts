import {
	IsEmail,
	IsNotEmpty,
	IsString,
	MinLength,
	Validate,
}                          from 'class-validator';
import { ApiProperty }     from '@nestjs/swagger';
import { MatchConstraint } from 'src/common';

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
}
