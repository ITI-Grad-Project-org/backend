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
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant, JwtAuthGuard } from '../auth';
import { ClientMembershipService } from './client-membership.service';

/**
 * Coach-facing view of the clients in the authenticated coach's tenant.
 *
 * Every endpoint is scoped to the tenant carried in the JWT, so one tenant can
 * never see or act on another tenant's clients. Adding clients happens through
 * the (forthcoming) invitation flow, not here.
 *
 *
 *
 * TODO(profile): add a client self-profile update flow separately from auth
 * once the client JWT guard/strategy naming is confirmed.
 */
@ApiTags('Clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('client')
export class ClientController {
  constructor(private readonly membershipService: ClientMembershipService) {}

  @Get()
  @ApiOperation({ summary: 'List the clients in my tenant' })
  @ApiResponse({ status: 200, description: 'Clients retrieved successfully' })
  @HttpCode(HttpStatus.OK)
  findAll(@CurrentTenant() tenantId: number) {
    return this.membershipService.findTenantMembers(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single client in my tenant' })
  @ApiResponse({ status: 200, description: 'Client retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Client not found in this tenant' })
  @HttpCode(HttpStatus.OK)
  async findOne(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) clientId: number,
  ) {
    const membership = await this.membershipService.findTenantMember(
      tenantId,
      clientId,
    );
    if (!membership) {
      throw new NotFoundException('Client not found in this tenant');
    }
    return membership;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remove a client from my tenant (does not delete their account)',
  })
  @ApiResponse({ status: 200, description: 'Client removed from tenant' })
  @ApiResponse({ status: 404, description: 'Client not found in this tenant' })
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) clientId: number,
  ) {
    const membership = await this.membershipService.findTenantMember(
      tenantId,
      clientId,
    );
    if (!membership) {
      throw new NotFoundException('Client not found in this tenant');
    }
    await this.membershipService.removeFromTenant(membership.id);
    return { message: 'Client removed from tenant' };
  }

  // @Patch(':id/profile')
  // @ApiOperation({
  //   summary: 'Update a client profile within my tenant',
  // })
  // @ApiResponse({ status: 200, description: 'Client profile updated' })
  // @ApiResponse({ status: 404, description: 'Client not found in this tenant' })
  // @HttpCode(HttpStatus.OK)
  // async updateProfile(
  //   @CurrentTenant() tenantId: number,
  //   @Param('id', ParseIntPipe) clientId: number,
  //   @Body() dto: UpdateClientMembershipProfileDto,
  // ) {
  //   const membership = await this.membershipService.updateTenantMemberProfile(
  //     tenantId,
  //     clientId,
  //     dto,
  //   );
  //   if (!membership) {
  //     throw new NotFoundException('Client not found in this tenant');
  //   }
  //   return membership;
  // }
}
