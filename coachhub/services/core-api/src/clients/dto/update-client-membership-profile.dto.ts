import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsArray,
	IsDateString,
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	IsUrl,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import {
	ActivityLevel,
	DietaryPreference,
	EquipmentType,
	FitnessGoal,
	TrainingExperience,
} from '../../common';

class ClientMeasurementDto {
	@ApiPropertyOptional({ example: '2026-07-03' })
	@IsOptional()
	@IsDateString()
	measuredAt?: string;

	@ApiPropertyOptional({ example: 82.5 })
	@IsOptional()
	@IsNumber()
	@Min(20)
	@Max(500)
	weightKg?: number;

	@ApiPropertyOptional({ example: 18.5 })
	@IsOptional()
	@IsNumber()
	@Min(1)
	@Max(80)
	bodyFatPct?: number;

	@ApiPropertyOptional({ example: 102 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	chestCm?: number;

	@ApiPropertyOptional({ example: 84 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	waistCm?: number;

	@ApiPropertyOptional({ example: 98 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	hipsCm?: number;

	@ApiPropertyOptional({ example: 36 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	armCm?: number;

	@ApiPropertyOptional({ example: 58 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	thighCm?: number;

	@ApiPropertyOptional({ type: [String] })
	@IsOptional()
	@IsArray()
	@IsUrl({}, { each: true })
	photos?: string[];
}

export class UpdateClientMembershipProfileDto {
	@ApiPropertyOptional({ enum: FitnessGoal })
	@IsOptional()
	@IsEnum(FitnessGoal)
	goal?: FitnessGoal;

	@ApiPropertyOptional({ enum: ActivityLevel })
	@IsOptional()
	@IsEnum(ActivityLevel)
	activityLevel?: ActivityLevel;

	@ApiPropertyOptional({ enum: TrainingExperience })
	@IsOptional()
	@IsEnum(TrainingExperience)
	trainingExperience?: TrainingExperience;

	@ApiPropertyOptional({ example: 4 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(7)
	trainingDaysPerWeek?: number;

	@ApiPropertyOptional({ enum: EquipmentType, isArray: true })
	@IsOptional()
	@IsArray()
	@IsEnum(EquipmentType, { each: true })
	availableEquipment?: EquipmentType[];

	@ApiPropertyOptional({ enum: DietaryPreference, isArray: true })
	@IsOptional()
	@IsArray()
	@IsEnum(DietaryPreference, { each: true })
	dietaryPreferences?: DietaryPreference[];

	@ApiPropertyOptional({ type: [String] })
	@IsOptional()
	@IsArray()
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

	@ApiPropertyOptional({ type: ClientMeasurementDto })
	@IsOptional()
	@ValidateNested()
	@Type(() => ClientMeasurementDto)
	measurement?: ClientMeasurementDto;
}
