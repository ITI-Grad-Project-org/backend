import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Max,
	Min,
} from 'class-validator';
import {
	ActivityLevel,
	DietaryPreference,
	EquipmentType,
	FitnessGoal,
	TrainingExperience,
} from 'src/common';

export class CreateClientIntakeDto {
	@ApiProperty({ enum: FitnessGoal, example: FitnessGoal.MUSCLE_GAIN })
	@IsEnum(FitnessGoal)
	@IsNotEmpty()
	goal: FitnessGoal;

	@ApiProperty({
		enum: ActivityLevel,
		example: ActivityLevel.MODERATELY_ACTIVE,
	})
	@IsEnum(ActivityLevel)
	@IsNotEmpty()
	activityLevel: ActivityLevel;

	@ApiProperty({
		enum: TrainingExperience,
		example: TrainingExperience.INTERMEDIATE,
	})
	@IsEnum(TrainingExperience)
	@IsNotEmpty()
	trainingExperience: TrainingExperience;

	@ApiPropertyOptional({ example: 4, minimum: 0, maximum: 7 })
	@IsNumber()
	@IsOptional()
	@Min(0)
	@Max(7)
	trainingDaysPerWeek?: number;

	@ApiProperty({
		enum: EquipmentType,
		isArray: true,
		example: [EquipmentType.FULL_GYM],
	})
	@IsOptional()
	@IsEnum(EquipmentType, { each: true })
	@IsArray()
	availableEquipment?: EquipmentType[];

	@ApiProperty({
		enum: DietaryPreference,
		isArray: true,
		example: [DietaryPreference.NONE],
	})
	@IsOptional()
	@IsEnum(DietaryPreference, { each: true })
	@IsArray()
	dietaryPreferences?: DietaryPreference[];

	@ApiPropertyOptional({ type: [String], example: ['Alergic to lactose'] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	allergies?: string[];

	@ApiPropertyOptional({
		type: [String],
		example: ['Chronic Shoulder dislocation'],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	medicalConditions?: string[];

	@ApiPropertyOptional({
		type: [String],
		example: ['Akhelis tendion inflamation'],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	injuries?: string[];

	@ApiPropertyOptional({ type: String, example: 'Akhelis tendion inflamation' })
	@IsOptional()
	@IsString()
	notes?: string;
}
