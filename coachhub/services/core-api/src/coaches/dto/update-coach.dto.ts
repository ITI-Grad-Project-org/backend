import {
	IsArray,
	IsDateString,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsPhoneNumber,
	IsString,
	IsUrl,
	Max,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CoachSpecialty, Gender, OfflineAvailability } from 'src/common';

export class CertificationDto {
	@ApiProperty({ example: 'NASM CPT' })
	@IsString()
	@IsNotEmpty()
	name: string;

	@ApiPropertyOptional({ example: 'NASM' })
	@IsOptional()
	@IsString()
	issuer?: string;

	@ApiPropertyOptional({ example: '2022-05-01' })
	@IsOptional()
	@IsDateString()
	issueDate?: string;

	@ApiPropertyOptional({ example: '2026-05-01' })
	@IsOptional()
	@IsDateString()
	expiryDate?: string;

	@ApiPropertyOptional({ example: 'https://cdn.example.com/certs/nasm.pdf' })
	@IsOptional()
	@IsUrl()
	fileUrl?: string;

	@ApiPropertyOptional({ example: 'https://nasm.org/verify/123' })
	@IsOptional()
	@IsUrl()
	credentialUrl?: string;
}

/**
 * Backs the five-step "Set up your coach profile" wizard. Every field is
 * optional so each step can PATCH just what it collected.
 */
export class UpdateCoachDto {
	@ApiPropertyOptional({ example: 'Jane' })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	firstName?: string;

	@ApiPropertyOptional({ example: 'Smith' })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	lastName?: string;

	// ── Step 1: About you ────────────────────────────────────────────────────
	// The profile photo is uploaded as the `avatar` file part, not a URL.
	@ApiPropertyOptional({ example: '+201000000000' })
	@IsOptional()
	@IsPhoneNumber()
	phone?: string;

	@ApiPropertyOptional({ example: 32, minimum: 16, maximum: 100 })
	@IsOptional()
	@IsInt()
	@Min(16)
	@Max(100)
	age?: number;

	@ApiPropertyOptional({ enum: Gender, example: Gender.FEMALE })
	@IsOptional()
	@IsEnum(Gender)
	gender?: Gender;

	@ApiPropertyOptional({ example: 'Lisbon, PT' })
	@IsOptional()
	@IsString()
	@MaxLength(150)
	location?: string;

	// ── Step 2: Your craft ───────────────────────────────────────────────────
	@ApiPropertyOptional({ enum: CoachSpecialty, isArray: true })
	@IsOptional()
	@IsArray()
	@IsEnum(CoachSpecialty, { each: true })
	specialties?: CoachSpecialty[];

	@ApiPropertyOptional({ example: 8, minimum: 0, maximum: 70 })
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(70)
	yearsExperience?: number;

	@ApiPropertyOptional({
		example: 'Head coach at Iron Temple, trained national-level lifters.',
	})
	@IsOptional()
	@IsString()
	careerExperience?: string;

	// ── Step 3: Certifications ───────────────────────────────────────────────
	@ApiPropertyOptional({ type: [CertificationDto] })
	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => CertificationDto)
	certifications?: CertificationDto[];

	// ── Step 4: Proof & portfolio ────────────────────────────────────────────
	@ApiPropertyOptional({ example: 'https://janesmith.coach' })
	@IsOptional()
	@IsUrl()
	portfolioUrl?: string;

	// Transformation photos are uploaded as `transformationPhotos` file parts.
	// Sending any replaces the stored set; sending none leaves it unchanged.

	@ApiPropertyOptional({ example: '"Lost 12kg in 5 months" — Sara A.' })
	@IsOptional()
	@IsString()
	featuredReviews?: string;

	@ApiPropertyOptional({
		example: 'A paragraph that makes a client want to work with you.',
	})
	@IsOptional()
	@IsString()
	bio?: string;

	// ── Step 5: Availability & pricing ───────────────────────────────────────
	@ApiPropertyOptional({
		enum: OfflineAvailability,
		example: OfflineAvailability.HYBRID,
	})
	@IsOptional()
	@IsEnum(OfflineAvailability)
	offlineAvailability?: OfflineAvailability;

	@ApiPropertyOptional({ example: 'Mon–Fri · 7 AM – 7 PM' })
	@IsOptional()
	@IsString()
	@MaxLength(200)
	availabilityHours?: string;

	@ApiPropertyOptional({ example: 120 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	priceFrom?: number;

	@ApiPropertyOptional({ example: 320 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	priceTo?: number;
}
