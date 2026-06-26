import { ApiProperty }       from '@nestjs/swagger';
import { IsInt, IsNotEmpty } from 'class-validator';
import { Type }              from 'class-transformer';

export class SwitchTenantDto {
	@ApiProperty( {
		example: 1,
		description: 'The tenant to switch the active session to',
	} )
	@Type( () => Number )
	@IsInt()
	@IsNotEmpty()
	tenantId: number;
}
