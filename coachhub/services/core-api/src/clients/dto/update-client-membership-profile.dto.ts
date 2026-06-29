import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class ClientHealthRecordDto {
  @ApiPropertyOptional()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({ example: '2026-06-28' })
  @IsOptional()
  @IsDateString()
  diagnosedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bodyPart?: string;
}

class ClientImageLibraryItemDto {
  @ApiPropertyOptional()
  @IsUrl()
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

class ClientBodyMeasurementDto {
  @ApiPropertyOptional({ example: '2026-06-28' })
  @IsString()
  measuredAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  bodyFatPercentage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  muscleMass?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  muscleRatio?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateClientMembershipProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fitnessGoal?: string;

  @ApiPropertyOptional({ type: [ClientHealthRecordDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientHealthRecordDto)
  injuryRecords?: ClientHealthRecordDto[];

  @ApiPropertyOptional({ type: [ClientHealthRecordDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientHealthRecordDto)
  chronicDiseases?: ClientHealthRecordDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fitnessLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(7)
  trainingDaysPerWeek?: number;

  @ApiPropertyOptional({ type: [ClientImageLibraryItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientImageLibraryItemDto)
  imageLibrary?: ClientImageLibraryItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  trainingPreferences?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  foodPreferences?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [ClientBodyMeasurementDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientBodyMeasurementDto)
  bodyMeasurements?: ClientBodyMeasurementDto[];
}
