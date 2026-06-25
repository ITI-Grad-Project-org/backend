import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class SwitchTenantDto {
  @ApiProperty({
    example: '6634f9c2e2a1b3d4c5f6a7b8',
    description: 'The tenant to switch the active session to',
  })
  @IsMongoId()
  @IsNotEmpty()
  tenantId: string;
}
