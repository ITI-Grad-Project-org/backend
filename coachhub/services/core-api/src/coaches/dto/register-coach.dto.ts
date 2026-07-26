import {
	IsEmail,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsTimeZone,
	Length,
	MaxLength,
	MinLength,
	Validate,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MatchConstraint } from 'src/common';

/**
 * Sign-up only asks who they are and what to call their business — everything
 * shown on the public profile is filled in afterwards through
 * `PATCH /coaches/me`, which backs the five-step setup wizard.
 */
export class RegisterCoachDto {
	@ApiProperty({ example: 'Jane' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	firstName: string;

	@ApiProperty({ example: 'Smith' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	lastName: string;

	@ApiProperty({ example: 'jane@acme.com' })
	@IsEmail()
	@IsNotEmpty()
	email: string;

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

	@ApiProperty({
		example: 'Iron Temple Coaching',
		description: 'Business/brand name — becomes the coach’s tenant',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	businessName: string;

	@ApiPropertyOptional({ example: 'Africa/Cairo' })
	@IsOptional()
	@IsTimeZone()
	timezone?: string;

	@ApiPropertyOptional({ example: 'EGP' })
	@IsOptional()
	@Length(3, 3)
	currency?: string;
}
