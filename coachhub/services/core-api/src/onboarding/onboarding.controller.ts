import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Post,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { ValidateOnboardingDto } from './dto/validate-onboarding.dto';
import { ConfirmOnboardingDto } from './dto/confirm-onboarding.dto';
import { ClientJwtAuthGuard, CurrentClient, Public } from '../auth';

/**
 * The one screen a signed-in client uses to join a tenant by code — whether the
 * code came from a coach invite or an approved join request. Coaches still
 * *issue* codes through `POST /invitation` and `POST /join-requests/:id/approve`.
 */
@Public()
@ApiTags('client/me/onboarding')
@ApiBearerAuth()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me/onboarding')
export class OnboardingController {
	constructor(private readonly onboardingService: OnboardingService) {}

	@Post('validate')
	@ApiOperation({
		summary: 'Check an invite/approval code without joining yet',
	})
	@ApiResponse({
		status: 200,
		description: 'Code is valid; returns the tenant it unlocks',
	})
	@ApiResponse({ status: 400, description: 'Invalid or expired code' })
	@HttpCode(HttpStatus.OK)
	validate(
		@CurrentClient('clientId') clientId: string,
		@Body() body: ValidateOnboardingDto,
	) {
		return this.onboardingService.validate(clientId, body.code);
	}

	@Post('confirm')
	@ApiOperation({
		summary: 'Join the tenant with the emailed code, optionally sending intake',
	})
	@ApiResponse({ status: 200, description: 'Joined; membership activated' })
	@ApiResponse({ status: 400, description: 'Invalid or expired code' })
	@HttpCode(HttpStatus.OK)
	confirm(
		@CurrentClient('clientId') clientId: string,
		@Body() body: ConfirmOnboardingDto,
	) {
		return this.onboardingService.confirm(clientId, body);
	}
}
