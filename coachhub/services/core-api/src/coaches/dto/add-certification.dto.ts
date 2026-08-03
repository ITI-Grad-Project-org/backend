import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsDateString,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUrl,
} from 'class-validator';

export class AddCertificationDto {
	@ApiProperty({ example: 'NASM CPT' })
	@IsString()
	@IsNotEmpty()
	name: string;

	@ApiPropertyOptional({ example: 'NASM' })
	@IsOptional()
	@IsString()
	issuer?: string;

	@ApiPropertyOptional({ example: '2022-05-01' })
	@IsOptional()
	@IsDateString()
	issueDate?: string;

	@ApiPropertyOptional({ example: '2026-05-01' })
	@IsOptional()
	@IsDateString()
	expiryDate?: string;

	@ApiPropertyOptional({ example: 'https://nasm.org/verify/123' })
	@IsOptional()
	@IsUrl()
	credentialUrl?: string;
}
