import {
	ArrayMaxSize,
	ArrayMinSize,
	ArrayUnique,
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUrl,
	Matches,
	MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EquipmentType, ExerciseCategory, MuscleGroup } from '../../common';
import { EXERCISE_INSTRUCTION_LIMITS } from '../../plans/training/utils/training-validation.constants';

/** Design §7.3 — everything the coach fills when creating a library exercise. */
export class CreateExerciseDto {
	@ApiProperty({ example: 'Romanian Deadlift' })
	@IsString()
	@IsNotEmpty()
	@Matches(/\S/, { message: 'name must contain a non-whitespace character' })
	@MaxLength(150)
	name: string;

	@ApiProperty({ enum: ExerciseCategory, example: ExerciseCategory.STRENGTH })
	@IsEnum(ExerciseCategory)
	category: ExerciseCategory;

	@ApiProperty({ enum: MuscleGroup, example: MuscleGroup.HAMSTRINGS })
	@IsEnum(MuscleGroup)
	primaryMuscle: MuscleGroup;

	@ApiPropertyOptional({ enum: MuscleGroup, isArray: true })
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(Object.values(MuscleGroup).length)
	@ArrayUnique()
	@IsEnum(MuscleGroup, { each: true })
	secondaryMuscles?: MuscleGroup[];

	@ApiPropertyOptional({ enum: EquipmentType, isArray: true })
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(Object.values(EquipmentType).length)
	@ArrayUnique()
	@IsEnum(EquipmentType, { each: true })
	equipment?: EquipmentType[];

	// Both media are optional — video, gif, both, or neither.
	@ApiPropertyOptional({ example: 'https://cdn.coachhub.app/demos/rdl.mp4' })
	@IsOptional()
	@IsUrl()
	@MaxLength(EXERCISE_INSTRUCTION_LIMITS.urlLength)
	demoVideoUrl?: string;

	@ApiPropertyOptional({ example: 'https://cdn.coachhub.app/demos/rdl.gif' })
	@IsOptional()
	@IsUrl()
	@MaxLength(EXERCISE_INSTRUCTION_LIMITS.urlLength)
	demoGifUrl?: string;

	@ApiPropertyOptional({ example: 'https://cdn.coachhub.app/thumbs/rdl.jpg' })
	@IsOptional()
	@IsUrl()
	@MaxLength(EXERCISE_INSTRUCTION_LIMITS.urlLength)
	thumbnailUrl?: string;

	@ApiProperty({
		type: [String],
		example: [
			'Stand with feet hip-width apart holding the bar',
			'Hinge at the hips, keeping the back flat',
			'Lower the bar along the legs to mid-shin',
			'Drive the hips forward to return to standing',
		],
	})
	@IsArray()
	@ArrayMinSize(1)
	@IsString({ each: true })
	@Matches(/\S/, {
		each: true,
		message: 'each instruction step must contain a non-whitespace character',
	})
	@MaxLength(EXERCISE_INSTRUCTION_LIMITS.stepLength, { each: true })
	@ArrayMaxSize(EXERCISE_INSTRUCTION_LIMITS.steps)
	instructionSteps: string[];
}
