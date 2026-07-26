import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { CreateClientIntakeDto } from '../../clients/dto/create-client-intake.dto';
import { ValidateOnboardingDto } from './validate-onboarding.dto';

/**
 * Same code as `ValidateOnboardingDto`, plus the intake questionnaire the
 * onboarding "last step" screen submits with the same tap. Intake stays
 * optional — the client can join first and fill it in later through
 * `POST /client/me/intake`.
 */
export class ConfirmOnboardingDto extends ValidateOnboardingDto {
	@ApiPropertyOptional({ type: CreateClientIntakeDto })
	@IsOptional()
	@ValidateNested()
	@Type(() => CreateClientIntakeDto)
	intake?: CreateClientIntakeDto;
}
