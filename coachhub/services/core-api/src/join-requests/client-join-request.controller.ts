import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { JoinRequestService } from './join-request.service';
import { CreateJoinRequestDto } from './dto/create-join-request.dto';
import { ClientJwtAuthGuard, CurrentClient, Public } from '../auth';

@Public()
@ApiTags('client/me/join-requests')
@ApiBearerAuth()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me/join-requests')
export class ClientJoinRequestController {
	constructor(private readonly joinRequestService: JoinRequestService) {}

	@Post()
	@ApiOperation({ summary: 'Ask to train with a coach from the directory' })
	@ApiResponse({ status: 201, description: 'Request sent' })
	@ApiResponse({
		status: 400,
		description: 'Already a member, or a request is already pending',
	})
	@ApiResponse({
		status: 403,
		description: 'Coach is not accepting new clients',
	})
	@ApiResponse({ status: 404, description: 'Coach not found' })
	create(
		@CurrentClient('clientId') clientId: string,
		@Body() body: CreateJoinRequestDto,
	) {
		return this.joinRequestService.request(clientId, body);
	}

	@Get()
	@ApiOperation({ summary: 'List my pending and rejected requests' })
	@ApiResponse({ status: 200, description: 'Requests retrieved' })
	@HttpCode(HttpStatus.OK)
	findAll(@CurrentClient('clientId') clientId: string) {
		return this.joinRequestService.listForClient(clientId);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Withdraw a request the coach has not answered' })
	@ApiResponse({ status: 200, description: 'Request withdrawn' })
	@ApiResponse({ status: 404, description: 'Pending request not found' })
	@HttpCode(HttpStatus.OK)
	remove(
		@CurrentClient('clientId') clientId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		return this.joinRequestService.withdraw(clientId, id);
	}
}
