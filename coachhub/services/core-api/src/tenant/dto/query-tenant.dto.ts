import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TenantSort, TenantType } from '../enums';

const trimToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class QueryTenantDto {
  @ApiPropertyOptional({
    example: 'gulf',
    description: 'Free-text search over agency name and CR number',
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: TenantSort,
    default: TenantSort.NEWEST,
    description: 'Sort order',
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsEnum(TenantSort)
  sort?: TenantSort;

  @ApiPropertyOptional({
    enum: TenantType,
    description: 'Filter by individual brokers or agencies',
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsEnum(TenantType)
  type?: TenantType;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
