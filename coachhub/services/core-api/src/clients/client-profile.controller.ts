import {
	Body,
	Controller,
	Delete,
	Get,
	Patch,
	UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientJwtAuthGuard, CurrentClient, Public } from '../auth';

// @Public() only skips the global coach-JWT guard; every route here is
// protected by the client-JWT guard instead.
@Public()
@ApiTags('Client Profile')
@ApiBearerAuth()
@UseGuards(ClientJwtAuthGuard)
@Controller('clients/me')
export class ClientProfileController {
	constructor(private readonly clientService: ClientService) {}

	@Get()
	@ApiOperation({ summary: 'Get my profile' })
	getMe(@CurrentClient('clientId') clientId: string) {
		return this.clientService.findProfileById(clientId);
	}

	@Patch()
	@ApiOperation({ summary: 'Update my profile' })
	update(
		@CurrentClient('clientId') clientId: string,
		@Body() updateClientDto: UpdateClientDto,
	) {
		return this.clientService.update(clientId, updateClientDto);
	}

	@Delete()
	@ApiOperation({ summary: 'Delete my account' })
	remove(@CurrentClient('clientId') clientId: string) {
		return this.clientService.remove(clientId);
	}
}
