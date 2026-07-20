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
	FocusArea,
	TrainingExperience,
	TrainingStyle,
} from 'src/common';

export class CreateClientIntakeDto {
	@ApiProperty({ enum: FitnessGoal, example: FitnessGoal.MUSCLE_GAIN })
	@IsEnum(FitnessGoal)
	@IsNotEmpty()
	goal: FitnessGoal;

	@ApiPropertyOptional({
		enum: ActivityLevel,
		example: ActivityLevel.MODERATELY_ACTIVE,
	})
	@IsOptional()
	@IsEnum(ActivityLevel)
	activityLevel?: ActivityLevel;

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

	@ApiPropertyOptional({
		enum: FocusArea,
		isArray: true,
		example: [FocusArea.STRENGTH, FocusArea.MOBILITY],
	})
	@IsOptional()
	@IsEnum(FocusArea, { each: true })
	@IsArray()
	focusAreas?: FocusArea[];

	@ApiPropertyOptional({
		enum: TrainingStyle,
		isArray: true,
		example: [TrainingStyle.HYPERTROPHY],
	})
	@IsOptional()
	@IsEnum(TrainingStyle, { each: true })
	@IsArray()
	trainingStyles?: TrainingStyle[];

	@ApiPropertyOptional({
		enum: EquipmentType,
		isArray: true,
		example: [EquipmentType.FULL_GYM],
	})
	@IsOptional()
	@IsEnum(EquipmentType, { each: true })
	@IsArray()
	availableEquipment?: EquipmentType[];

	@ApiPropertyOptional({
		enum: DietaryPreference,
		isArray: true,
		example: [DietaryPreference.OMNIVORE],
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
