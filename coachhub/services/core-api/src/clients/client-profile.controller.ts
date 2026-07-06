import {
	BadRequestException,
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	NotFoundException,
	Patch,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentClient, Public } from 'src/auth';
import { ClientJwtAuthGuard } from 'src/auth/guards/client-jwt-auth.guard';
import { ClientMembershipService } from './client-membership.service';
import { ClientService } from './client.service';
import { UpdateClientMembershipProfileDto } from './dto/update-client-membership-profile.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('client/me')
@ApiBearerAuth()
@Public()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me')
export class ClientProfileController {
	constructor(
		private readonly clientService: ClientService,
		private readonly membershipService: ClientMembershipService,
	) {}

	@Patch('profile')
	@ApiOperation({ summary: 'Allow the client to update their global profile' })
	@ApiResponse({ status: 200, description: 'Client profile updated' })
	@ApiResponse({
		status: 404,
		description: 'Client not found, please try again later',
	})
	@HttpCode(HttpStatus.OK)
	async updateClientPersonalProfile(
		@Body() body: UpdateClientDto,
		@CurrentClient('clientId') clientId: string,
	) {
		const updatedClient = await this.clientService.updateClientProfile(
			clientId,
			body,
		);

		if (!updatedClient) {
			throw new NotFoundException('Client not found');
		}

		return updatedClient;
	}

	@Patch('tenant-profile')
	@ApiOperation({
		summary: 'Allow the client to update their tenant-scoped profile',
	})
	@ApiResponse({ status: 200, description: 'Client tenant profile updated' })
	@ApiResponse({
		status: 400,
		description: 'Client has no active tenant selected',
	})
	@ApiResponse({
		status: 404,
		description: 'Client membership not found in this tenant',
	})
	@HttpCode(HttpStatus.OK)
	async updateClientTenantProfile(
		@Body() body: UpdateClientMembershipProfileDto,
		@CurrentClient('clientId') clientId: string,
		@CurrentClient('tenantId') tenantId: string | null,
	) {
		if (!tenantId) {
			throw new BadRequestException('No active tenant selected');
		}

		const updatedMembership =
			await this.membershipService.updateClientOwnTenantProfile(
				clientId,
				tenantId,
				body,
			);

		if (!updatedMembership) {
			throw new NotFoundException('Client membership not found in this tenant');
		}

		return updatedMembership;
	}
}
