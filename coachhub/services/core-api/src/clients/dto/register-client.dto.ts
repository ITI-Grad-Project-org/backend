import {
	IsDateString,
	IsEmail,
	IsEnum,
	IsInt,
	IsNumber,
	IsOptional,
	IsPhoneNumber,
	IsString,
	IsStrongPassword,
	IsUUID,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	ActivityLevel,
	DietaryPreference,
	EquipmentType,
	FitnessGoal,
	Gender,
	TrainingExperience,
} from 'src/common';

/**
 * Design §7.2 — invitation-flow registration. One transaction writes:
 * `clients` row, membership activation, `client_intakes` row and the
 * first `measurements` row (weightKg).
 */
export class RegisterClientDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	invitationToken: string;

	// → clients
	@ApiProperty({ example: 'Sara' })
	@IsString()
	@MaxLength(100)
	firstName: string;

	@ApiProperty({ example: 'Adel' })
	@IsString()
	@MaxLength(100)
	lastName: string;

	@ApiProperty({
		example: 'sara@example.com',
		description: 'Must match the invitation',
	})
	@IsEmail()
	email: string;

	@ApiPropertyOptional({ example: '+201001234567' })
	@IsOptional()
	@IsPhoneNumber()
	phone?: string;

	@ApiProperty({ example: 'S3cure!pass' })
	@IsStrongPassword()
	password: string;

	@ApiProperty({ example: '1998-04-12' })
	@IsDateString()
	dateOfBirth: string;

	@ApiProperty({ enum: Gender })
	@IsEnum(Gender)
	gender: Gender;

	@ApiProperty({ example: 168, minimum: 50, maximum: 300 })
	@IsNumber()
	@Min(50)
	@Max(300)
	heightCm: number;

	// → measurements (first row)
	@ApiProperty({ example: 72.5, minimum: 20, maximum: 500 })
	@IsNumber()
	@Min(20)
	@Max(500)
	weightKg: number;

	// → client_intakes
	@ApiProperty({ enum: FitnessGoal })
	@IsEnum(FitnessGoal)
	goal: FitnessGoal;

	@ApiProperty({ enum: ActivityLevel })
	@IsEnum(ActivityLevel)
	activityLevel: ActivityLevel;

	@ApiProperty({ enum: TrainingExperience })
	@IsEnum(TrainingExperience)
	trainingExperience: TrainingExperience;

	@ApiPropertyOptional({ example: 4, minimum: 1, maximum: 7 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(7)
	trainingDaysPerWeek?: number;

	@ApiPropertyOptional({ enum: EquipmentType, isArray: true })
	@IsOptional()
	@IsEnum(EquipmentType, { each: true })
	availableEquipment?: EquipmentType[];

	@ApiPropertyOptional({ enum: DietaryPreference, isArray: true })
	@IsOptional()
	@IsEnum(DietaryPreference, { each: true })
	dietaryPreferences?: DietaryPreference[];

	@ApiPropertyOptional({ type: [String], example: ['peanuts'] })
	@IsOptional()
	@IsString({ each: true })
	allergies?: string[];

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	medicalConditions?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	injuries?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	notes?: string;
}
