import {
  IsString,
  IsNotEmpty,
  Matches,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Real Estate' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'acme-real-estate' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens (e.g. acme-real-estate)',
  })
  slug: string;

  @ApiPropertyOptional({ example: 'CR-1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  commercialRegistrationNumber?: string;
}
