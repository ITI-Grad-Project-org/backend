import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';
import { RegisterDto } from './register-user.dto';

class CoachCertificationDto {
  @ApiPropertyOptional()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  issuer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  issuedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  fileUrl?: string;
}

class CoachPortfolioItemDto {
  @ApiPropertyOptional()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  linkUrl?: string;
}

class CoachClientTransformationDto {
  @ApiPropertyOptional()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsUrl()
  beforeImageUrl: string;

  @ApiProperty()
  @IsUrl()
  afterImageUrl: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  mediaUrls?: string[];
}

class CoachLocationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;
}

class CoachPriceRangeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  min?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  max?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateUserDto extends PartialType(RegisterDto) {
  @ApiPropertyOptional({ type: [CoachCertificationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoachCertificationDto)
  certifications?: CoachCertificationDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  yearsOfExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  professionalExperience?: string;

  @ApiPropertyOptional({ type: [CoachPortfolioItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoachPortfolioItemDto)
  portfolio?: CoachPortfolioItemDto[];

  @ApiPropertyOptional({ type: [CoachClientTransformationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoachClientTransformationDto)
  clientTransformations?: CoachClientTransformationDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  offlineCoachingAvailable?: boolean;

  @ApiPropertyOptional({ type: CoachLocationDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CoachLocationDto)
  location?: CoachLocationDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  biography?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  availabilityHours?: string;

  @ApiPropertyOptional({ type: CoachPriceRangeDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CoachPriceRangeDto)
  priceRange?: CoachPriceRangeDto;
}
