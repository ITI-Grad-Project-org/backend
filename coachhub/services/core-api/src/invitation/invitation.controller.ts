import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	NotFoundException,
	Param,
	ParseIntPipe,
	Post,
	UseGuards,
}                              from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
}                              from '@nestjs/swagger';
import { InvitationService }   from './invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import {
	CurrentClient,
	CurrentTenant,
	CurrentUser,
	Public,
}                              from '../auth';
import { ClientJwtAuthGuard }  from '../auth/guards/client-jwt-auth.guard';

@ApiTags( 'Invitations' )
@ApiBearerAuth()
@Controller( 'invitation' )
export class InvitationController {
	constructor ( private readonly invitationService: InvitationService ) {}

	@Post()
	@ApiOperation( { summary: 'Invite a client into my tenant by email' } )
	@ApiResponse( { status: 201, description: 'Invitation created and sent' } )
	@ApiResponse( { status: 400, description: 'A pending invitation already exists' } )
	@HttpCode( HttpStatus.CREATED )
	create (
		@CurrentUser( 'userId' ) coachId: number,
		@CurrentTenant() tenantId: number,
		@Body() createInvitationDto: CreateInvitationDto,
	) {
		return this.invitationService.create(
			coachId,
			tenantId,
			createInvitationDto,
		);
	}

	@Get()
	@ApiOperation( { summary: 'List invitations in my tenant' } )
	@ApiResponse( { status: 200, description: 'Invitations retrieved' } )
	@HttpCode( HttpStatus.OK )
	findAll ( @CurrentTenant() tenantId: number ) {
		return this.invitationService.findAll( tenantId );
	}

	@Get( ':id' )
	@ApiOperation( { summary: 'Get a single invitation in my tenant' } )
	@ApiResponse( { status: 200, description: 'Invitation retrieved' } )
	@ApiResponse( { status: 404, description: 'Invitation not found in this tenant' } )
	@HttpCode( HttpStatus.OK )
	async findOne (
		@CurrentTenant() tenantId: number,
		@Param( 'id', ParseIntPipe ) id: number,
	) {
		const invitation = await this.invitationService.findOne( tenantId, id );
		if ( !invitation ) {
			throw new NotFoundException( 'Invitation not found in this tenant' );
		}
		return invitation;
	}

	@Delete( ':id' )
	@ApiOperation( { summary: 'Revoke a pending invitation in my tenant' } )
	@ApiResponse( { status: 200, description: 'Invitation revoked' } )
	@ApiResponse( { status: 404, description: 'Invitation not found in this tenant' } )
	@HttpCode( HttpStatus.OK )
	revoke (
		@CurrentTenant() tenantId: number,
		@Param( 'id', ParseIntPipe ) id: number,
	) {
		return this.invitationService.revoke( tenantId, id );
	}

	@Public()
	@Get( 'token/:token' )
	@ApiOperation( {
		summary: 'Preview an invitation by its token (used by the accept page)',
	} )
	@ApiResponse( { status: 200, description: 'Invitation retrieved' } )
	@ApiResponse( { status: 404, description: 'Invitation not found' } )
	@HttpCode( HttpStatus.OK )
	findByToken ( @Param( 'token' ) token: string ) {
		return this.invitationService.findByToken( token );
	}

	@Public()
	@UseGuards( ClientJwtAuthGuard )
	@Post( 'token/:token/accept' )
	@ApiBearerAuth()
	@ApiOperation( { summary: 'Accept an invitation as the logged-in client' } )
	@ApiResponse( { status: 200, description: 'Invitation accepted' } )
	@ApiResponse( { status: 400, description: 'Invitation expired or not pending' } )
	@ApiResponse( { status: 403, description: 'Invitation addressed to another email' } )
	@HttpCode( HttpStatus.OK )
	accept (
		@CurrentClient( 'clientId' ) clientId: string,
		@Param( 'token' ) token: string,
	) {
		return this.invitationService.accept( parseInt( clientId, 10 ), token );
	}
}
