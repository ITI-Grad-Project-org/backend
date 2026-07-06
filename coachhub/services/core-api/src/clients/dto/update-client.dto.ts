import { ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsDateString,
	IsEmail,
	IsEnum,
	IsNumber,
	IsOptional,
	IsPhoneNumber,
	IsString,
	IsUrl,
	Max,
	MaxLength,
	Min,
	MinLength,
	Validate,
} from 'class-validator';
import { Gender, MatchConstraint } from 'src/common';

export class UpdateClientDto {
	@ApiPropertyOptional({ example: 'Alice' })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	firstName?: string;

	@ApiPropertyOptional({ example: 'Smith' })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	lastName?: string;

	@ApiPropertyOptional({ example: 'alice@example.com' })
	@IsOptional()
	@IsEmail()
	email?: string;

	@ApiPropertyOptional({ example: '+201000000000' })
	@IsOptional()
	@IsPhoneNumber()
	phone?: string;

	@ApiPropertyOptional({ example: 'newPassword123', minLength: 6 })
	@IsOptional()
	@IsString()
	@MinLength(6)
	password?: string;

	@ApiPropertyOptional({ example: 'newPassword123' })
	@IsOptional()
	@IsString()
	@Validate(MatchConstraint, ['password'])
	confirmPassword?: string;

	@ApiPropertyOptional({ example: 'https://cdn.coachhub.app/clients/a.png' })
	@IsOptional()
	@IsUrl()
	avatarUrl?: string;

	@ApiPropertyOptional({ example: '1998-04-12' })
	@IsOptional()
	@IsDateString()
	dateOfBirth?: string;

	@ApiPropertyOptional({ enum: Gender, example: Gender.FEMALE })
	@IsOptional()
	@IsEnum(Gender)
	gender?: Gender;

	@ApiPropertyOptional({ example: 168.5 })
	@IsOptional()
	@IsNumber()
	@Min(50)
	@Max(300)
	heightCm?: number;
}
