import {
	IsDateString,
	IsEnum,
	IsOptional,
	IsUUID,
}                                           from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentStatus }                 from 'src/common';

export class AssignMealPlanDto {
	@ApiProperty( { format: 'uuid', description: 'Membership of the client in my tenant' } )
	@IsUUID()
	membershipId: string;

	@ApiProperty( { example: '2026-07-07' } )
	@IsDateString()
	startDate: string;

	@ApiPropertyOptional( { example: '2026-08-31' } )
	@IsOptional()
	@IsDateString()
	endDate?: string;

	@ApiPropertyOptional( { enum: AssignmentStatus, default: AssignmentStatus.SCHEDULED } )
	@IsOptional()
	@IsEnum( AssignmentStatus )
	status?: AssignmentStatus;
}
