import {
	IsDateString,
	IsEnum,
	IsNumber,
	IsOptional,
	Max,
	Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Gender } from 'src/common';
import { CreateClientDto } from './create-client.dto';

// Email changes need a verification flow and passwords go through the
// reset flow, so neither is editable here.
export class UpdateClientDto extends PartialType(
	OmitType(CreateClientDto, ['email', 'password', 'confirmPassword'] as const),
) {
	@ApiPropertyOptional({ example: '1998-04-12' })
	@IsOptional()
	@IsDateString()
	dateOfBirth?: string;

	@ApiPropertyOptional({ enum: Gender, example: Gender.FEMALE })
	@IsOptional()
	@IsEnum(Gender)
	gender?: Gender;

	// Sent as multipart form fields, so numerics arrive as strings — coerce
	// them before validation.
	@ApiPropertyOptional({ example: 168.5 })
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(50)
	@Max(300)
	heightCm?: number;

	@ApiPropertyOptional({ example: 72.5 })
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(20)
	@Max(500)
	weightKg?: number;

	// The profile photo is uploaded as the `avatar` file part of this
	// multipart request — there is no URL field.
}
