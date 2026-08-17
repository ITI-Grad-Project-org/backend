import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { MembershipStatus } from '../../common';

export const MAX_MEMBERSHIP_PAGE_SIZE = 100;

export class QueryMembershipsDto {
	@ApiPropertyOptional({
		enum: MembershipStatus,
		description: 'Omit to include every status, archived and blocked included.',
	})
	@IsOptional()
	@IsEnum(MembershipStatus)
	status?: MembershipStatus;

	@ApiPropertyOptional({
		example: 'ali',
		description: 'Case-insensitive match on first name, last name or email.',
	})
	@IsOptional()
	@IsString()
	@MaxLength(150)
	search?: string;

	@ApiPropertyOptional({ example: 1, default: 1 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number;

	@ApiPropertyOptional({
		example: 20,
		default: 20,
		maximum: MAX_MEMBERSHIP_PAGE_SIZE,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(MAX_MEMBERSHIP_PAGE_SIZE)
	limit?: number;
}
