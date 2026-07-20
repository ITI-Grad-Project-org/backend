import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateJoinRequestDto {
	@ApiProperty({
		format: 'uuid',
		description: 'Tenant of the coach the client picked in the directory',
	})
	@IsUUID()
	tenantId: string;

	@ApiPropertyOptional({
		example: 'Training for a half marathon in October — would love your help.',
		description: 'Short note the coach reads when deciding',
	})
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	message?: string;
}
