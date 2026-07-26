import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	NotFoundException,
	Param,
	ParseUUIDPipe,
	Post,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { InvitationService } from './invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { CurrentTenant, CurrentUser } from '../auth';

@ApiTags('Invitations')
@ApiBearerAuth()
@Controller('invitation')
export class InvitationController {
	constructor(private readonly invitationService: InvitationService) {}

	@Post()
	@ApiOperation({ summary: 'Invite a client into my tenant by email' })
	@ApiResponse({ status: 201, description: 'Invitation created and sent' })
	@ApiResponse({
		status: 400,
		description: 'A pending invitation already exists',
	})
	@HttpCode(HttpStatus.CREATED)
	create(
		@CurrentUser('userId') coachId: string,
		@CurrentTenant() tenantId: string,
		@Body() createInvitationDto: CreateInvitationDto,
	) {
		return this.invitationService.create(
			coachId,
			tenantId,
			createInvitationDto,
		);
	}

	@Get()
	@ApiOperation({ summary: 'List invitations in my tenant' })
	@ApiResponse({ status: 200, description: 'Invitations retrieved' })
	@HttpCode(HttpStatus.OK)
	findAll(@CurrentTenant() tenantId: string) {
		return this.invitationService.findAll(tenantId);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a single invitation in my tenant' })
	@ApiResponse({ status: 200, description: 'Invitation retrieved' })
	@ApiResponse({
		status: 404,
		description: 'Invitation not found in this tenant',
	})
	@HttpCode(HttpStatus.OK)
	async findOne(
		@CurrentTenant() tenantId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		const invitation = await this.invitationService.findOne(tenantId, id);
		if (!invitation) {
			throw new NotFoundException('Invitation not found in this tenant');
		}
		return invitation;
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Revoke a pending invitation in my tenant' })
	@ApiResponse({ status: 200, description: 'Invitation revoked' })
	@ApiResponse({
		status: 404,
		description: 'Invitation not found in this tenant',
	})
	@HttpCode(HttpStatus.OK)
	revoke(
		@CurrentTenant() tenantId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		return this.invitationService.revoke(tenantId, id);
	}
}
