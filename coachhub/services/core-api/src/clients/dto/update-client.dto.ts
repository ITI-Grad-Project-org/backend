import {
	IsDateString,
	IsEnum,
	IsNumber,
	IsOptional,
	Max,
	Min,
} from 'class-validator';
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

	@ApiPropertyOptional({ example: 168.5 })
	@IsOptional()
	@IsNumber()
	@Min(50)
	@Max(300)
	heightCm?: number;
}

