import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { CreateClientIntakeDto } from '../../clients/dto/create-client-intake.dto';

/**
 * The onboarding "last step" screen submits the whole per-tenant questionnaire
 * with the same tap that accepts the invitation, so the intake rides along
 * here. It stays optional — a client can accept first and fill the intake
 * later through `POST /client/me/intake`.
 */
export class AcceptInvitationDto {
	@ApiPropertyOptional({ type: CreateClientIntakeDto })
	@IsOptional()
	@ValidateNested()
	@Type(() => CreateClientIntakeDto)
	intake?: CreateClientIntakeDto;
}
