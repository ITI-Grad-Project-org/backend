import {
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	Max,
	Min,
	ValidateIf,
}                                           from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Design §7.4 — THE DROP POPUP. One dragged exercise onto a (week, day) grid
 * cell; the server finds or lazily creates the program_workout for that cell.
 */
export class PrescribeExerciseDto {
	@ApiProperty( { format: 'uuid' } )
	@IsUUID()
	exerciseId: string;

	@ApiProperty( { example: 1, description: 'Grid cell — week' } )
	@IsInt()
	@Min( 1 )
	weekNumber: number;

	@ApiProperty( { example: 3, description: 'Grid cell — day (1..7)' } )
	@IsInt()
	@Min( 1 )
	@Max( 7 )
	dayNumber: number;

	@ApiPropertyOptional( { description: 'Default: append to the end of the day' } )
	@IsOptional()
	@IsInt()
	@Min( 1 )
	position?: number;

	// popup fields
	@ApiProperty( { example: 4, minimum: 1, maximum: 20 } )
	@IsInt()
	@Min( 1 )
	@Max( 20 )
	sets: number;

	@ApiPropertyOptional( { example: 8, description: 'Required unless durationSeconds is set' } )
	@ValidateIf( ( o ) => o.durationSeconds == null )
	@IsInt()
	@Min( 1 )
	repsMin?: number;

	@ApiPropertyOptional( { example: 12, description: 'Omit = fixed reps' } )
	@IsOptional()
	@IsInt()
	@Min( 1 )
	repsMax?: number;

	@ApiPropertyOptional( { example: 60, description: 'Time-based alternative (planks, cardio)' } )
	@ValidateIf( ( o ) => o.repsMin == null )
	@IsInt()
	@Min( 1 )
	durationSeconds?: number;

	@ApiPropertyOptional( { example: 70, description: 'Omit = bodyweight / open' } )
	@IsOptional()
	@IsNumber()
	@Min( 0 )
	weightKg?: number;

	@ApiPropertyOptional( { example: 90, default: 90 } )
	@IsOptional()
	@IsInt()
	@Min( 0 )
	restSeconds?: number;

	@ApiPropertyOptional( { example: '3-1-1-0' } )
	@IsOptional()
	@Matches( /^\d-\d-\d-\d$/ )
	tempo?: string;

	@ApiPropertyOptional( { example: 8, minimum: 1, maximum: 10 } )
	@IsOptional()
	@IsNumber()
	@Min( 1 )
	@Max( 10 )
	targetRpe?: number;

	@ApiPropertyOptional( { description: 'The blue "Coach note" banner' } )
	@IsOptional()
	@IsString()
	coachNotes?: string;

	@ApiPropertyOptional( { example: 1, description: 'Exercises sharing a group are a superset' } )
	@IsOptional()
	@IsInt()
	supersetGroup?: number;
}
