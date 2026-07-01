import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientMembershipService } from './client-membership.service';
import { ClientProfileController } from './client-profile.controller';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { ClientMembership } from './entities/client-membership.entity';
import { Client } from './entities/client.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Client, ClientMembership])],
  controllers: [ClientController, ClientProfileController],
  providers: [ClientService, ClientMembershipService],
  exports: [ClientService, ClientMembershipService],
})
export class ClientModule {}
