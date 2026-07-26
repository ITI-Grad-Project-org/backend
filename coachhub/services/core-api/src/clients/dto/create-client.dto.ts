import {
	IsEmail,
	IsNotEmpty,
	IsOptional,
	IsPhoneNumber,
	IsString,
	MaxLength,
	MinLength,
	Validate,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MatchConstraint } from 'src/common';

/**
 * Standalone client registration (design §7.2, minus the invitation code —
 * invitations are accepted through `POST /invitation/accept` afterwards).
 * Body/demographic details are filled in later via `PATCH /clients/me`.
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
}
