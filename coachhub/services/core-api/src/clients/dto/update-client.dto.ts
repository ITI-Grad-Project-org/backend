import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import { CreateClientDto } from './create-client.dto';
import { Gender } from '../enums/gender.enum';

export class UpdateClientDto extends PartialType(CreateClientDto) {
  @ApiPropertyOptional({ example: 'alice_smith' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ example: '+966500000000' })
  @IsOptional()
  @IsPhoneNumber()
  phoneNumber?: string;

  @ApiPropertyOptional({ enum: Gender, example: Gender.FEMALE })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '1995-05-20' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: 170 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;

  @ApiPropertyOptional({ example: 70 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  profilePicture?: string;
}
