import {
	IsEmail,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsPhoneNumber,
	IsString,
	IsTimeZone,
	IsUrl,
	Length,
	MaxLength,
	Min,
	MinLength,
	Validate,
	ValidateNested,
}                                           from 'class-validator';
import { Type }                             from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CoachSpecialty, MatchConstraint }  from 'src/common';

export class CertificationDto {
	@ApiProperty( { example: 'NASM CPT' } )
	@IsString()
	@IsNotEmpty()
	name: string;

	@ApiPropertyOptional( { example: 'NASM' } )
	@IsOptional()
	@IsString()
	issuer?: string;

	@ApiPropertyOptional( { example: 2022 } )
	@IsOptional()
	@IsInt()
	year?: number;

	@ApiPropertyOptional( { example: 'https://nasm.org/verify/123' } )
	@IsOptional()
	@IsUrl()
	credentialUrl?: string;
}

export class RegisterCoachDto {
	@ApiProperty( { example: 'Jane' } )
	@IsString()
	@IsNotEmpty()
	@MaxLength( 100 )
	firstName: string;

	@ApiProperty( { example: 'Smith' } )
	@IsString()
	@IsNotEmpty()
	@MaxLength( 100 )
	lastName: string;

	@ApiProperty( { example: 'jane@acme.com' } )
	@IsEmail()
	@IsNotEmpty()
	email: string;

	@ApiPropertyOptional( { example: '+201000000000' } )
	@IsOptional()
	@IsPhoneNumber()
	phone?: string;

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

	@ApiPropertyOptional(
		{ example: 'Strength coach with 8 years of experience' } )
	@IsOptional()
	@IsString()
	bio?: string;

	@ApiPropertyOptional( { enum: CoachSpecialty, isArray: true } )
	@IsOptional()
	@IsEnum( CoachSpecialty, { each: true } )
	specialties?: CoachSpecialty[];

	@ApiPropertyOptional( { example: 8 } )
	@IsOptional()
	@IsInt()
	@Min( 0 )
	yearsExperience?: number;

	@ApiPropertyOptional( { type: [ CertificationDto ] } )
	@IsOptional()
	@ValidateNested( { each: true } )
	@Type( () => CertificationDto )
	certifications?: CertificationDto[];

	@ApiProperty( { example: 'Iron Temple Coaching' } )
	@IsString()
	@IsNotEmpty()
	@MaxLength( 150 )
	businessName: string;

	@ApiPropertyOptional( { example: 'Africa/Cairo' } )
	@IsOptional()
	@IsTimeZone()
	timezone?: string;

	@ApiPropertyOptional( { example: 'EGP' } )
	@IsOptional()
	@Length( 3, 3 )
	currency?: string;
}
