import {
	ArrayMaxSize,
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUrl,
	MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EquipmentType, ExerciseCategory, MuscleGroup } from 'src/common';

/** Design §7.3 — everything the coach fills when creating a library exercise. */
export class CreateExerciseDto {
	@ApiProperty({ example: 'Romanian Deadlift' })
	@IsString()
	@IsNotEmpty()
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
	@IsEnum(MuscleGroup, { each: true })
	secondaryMuscles?: MuscleGroup[];

	@ApiPropertyOptional({ enum: EquipmentType, isArray: true })
	@IsOptional()
	@IsEnum(EquipmentType, { each: true })
	equipment?: EquipmentType[];

	// Both media are optional — video, gif, both, or neither.
	@ApiPropertyOptional({ example: 'https://cdn.coachhub.app/demos/rdl.mp4' })
	@IsOptional()
	@IsUrl()
	demoVideoUrl?: string;

	@ApiPropertyOptional({ example: 'https://cdn.coachhub.app/demos/rdl.gif' })
	@IsOptional()
	@IsUrl()
	demoGifUrl?: string;

	@ApiPropertyOptional({ example: 'https://cdn.coachhub.app/thumbs/rdl.jpg' })
	@IsOptional()
	@IsUrl()
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
	@IsString({ each: true })
	@ArrayMaxSize(10)
	instructionSteps: string[];
}
