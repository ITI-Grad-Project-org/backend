import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientMembershipService } from './client-membership.service';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { ClientMembership } from './entities/client-membership.entity';
import { Client } from './entities/client.entity';
import { ClientProfileController } from './client-profile.controller';
import { ClientIntake } from './entities/client-intake.entity';
import { Measurement } from '../measurements/entities/measurement.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Client, ClientMembership, ClientIntake, Measurement])],
	controllers: [ClientController, ClientProfileController],
	providers: [ClientService, ClientMembershipService],
	exports: [ClientService, ClientMembershipService],
})
export class ClientModule {}
