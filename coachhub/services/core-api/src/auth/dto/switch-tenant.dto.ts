import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class SwitchTenantDto {
	@ApiProperty({
		example: '4e1f6f3a-9c2d-4d8e-b1a7-2f8c1f0a9b3c',
		description: 'The tenant to switch the active session to',
	})
	@IsUUID()
	@IsNotEmpty()
	tenantId: string;
}
