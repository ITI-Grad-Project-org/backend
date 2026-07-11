import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Patch,
	Post,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentClient, CurrentTenant, Public } from '../auth';
import { ClientJwtAuthGuard } from '../auth/guards/client-jwt-auth.guard';
import { ClientIntakeService } from './client-intake.service';
import { CreateClientIntakeDto } from './dto/create-client-intake.dto';
import { UpdateClientIntakeDto } from './dto/update-client-intake.dto';

@ApiTags('client/me/intake')
@ApiBearerAuth()
@Public()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me/intake')
export class ClientIntakeController {
	constructor(private readonly clientIntakeService: ClientIntakeService) {}

	@Post()
	@ApiOperation({ summary: 'Create the current client intake profile' })
	@ApiResponse({ status: 201, description: 'Client intake created' })
	@ApiResponse({
		status: 400,
		description: 'Client has no active tenant selected',
	})
	@ApiResponse({
		status: 404,
		description: 'Active client membership not found',
	})
	@ApiResponse({ status: 409, description: 'Client intake already exists' })
	create(
		@Body() body: CreateClientIntakeDto,
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
	) {
		return this.clientIntakeService.createClientIntake(
			clientId,
			tenantId,
			body,
		);
	}

	@Get()
	@ApiOperation({ summary: 'Get the current client intake profile' })
	@ApiResponse({ status: 200, description: 'Client intake retrieved' })
	@ApiResponse({
		status: 400,
		description: 'Client has no active tenant selected',
	})
	@ApiResponse({ status: 404, description: 'Client intake not found' })
	@HttpCode(HttpStatus.OK)
	findOne(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
	) {
		return this.clientIntakeService.getClientIntake(clientId, tenantId);
	}

	@Patch()
	@ApiOperation({ summary: 'Update the current client intake profile' })
	@ApiResponse({ status: 200, description: 'Client intake updated' })
	@ApiResponse({
		status: 400,
		description: 'Client has no active tenant selected',
	})
	@ApiResponse({ status: 404, description: 'Client intake not found' })
	@HttpCode(HttpStatus.OK)
	update(
		@Body() body: UpdateClientIntakeDto,
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
	) {
		return this.clientIntakeService.updateClientIntake(
			clientId,
			tenantId,
			body,
		);
	}

	@Delete()
	@ApiOperation({ summary: 'Delete the current client intake profile' })
	@ApiResponse({ status: 200, description: 'Client intake deleted' })
	@ApiResponse({
		status: 400,
		description: 'Client has no active tenant selected',
	})
	@ApiResponse({ status: 404, description: 'Client intake not found' })
	@HttpCode(HttpStatus.OK)
	remove(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
	) {
		return this.clientIntakeService.deleteClientIntake(clientId, tenantId);
	}
}
