import {
	IsDateString,
	IsEmail,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsPhoneNumber,
	IsString,
	Max,
	MaxLength,
	Min,
	MinLength,
	Validate,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, MatchConstraint } from 'src/common';

/**
 * Standalone client registration (design §7.2, minus the invitation token —
 * invitations are accepted through `POST /invitations/accept` afterwards).
 */
export class CreateClientDto {
	@ApiProperty({ example: 'Alice' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	firstName: string;

	@ApiProperty({ example: 'Smith' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	lastName: string;

	@ApiProperty({ example: 'alice@example.com' })
	@IsEmail()
	@IsNotEmpty()
	email: string;

	@ApiPropertyOptional({ example: '+201000000000' })
	@IsOptional()
	@IsPhoneNumber()
	phone?: string;

	@ApiProperty({ example: 'password123', minLength: 6 })
	@IsString()
	@IsNotEmpty()
	@MinLength(6)
	password: string;

	@ApiProperty({ example: 'password123' })
	@IsString()
	@IsNotEmpty()
	@Validate(MatchConstraint, ['password'])
	confirmPassword: string;

	@ApiProperty({ example: '1998-04-12' })
	@IsDateString()
	dateOfBirth: string;

	@ApiProperty({ enum: Gender, example: Gender.FEMALE })
	@IsEnum(Gender)
	gender: Gender;

	@ApiPropertyOptional({ example: 168.5 })
	@IsOptional()
	@IsNumber()
	@Min(50)
	@Max(300)
	heightCm?: number;
}
