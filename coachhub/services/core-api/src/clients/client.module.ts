import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientIntakeController } from './client-intake.controller';
import { ClientIntakeService } from './client-intake.service';
import { ClientMembershipService } from './client-membership.service';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { ClientIntake } from './entities/client-intake.entity';
import { ClientMembership } from './entities/client-membership.entity';
import { Client } from './entities/client.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Client, ClientMembership, ClientIntake])],
	controllers: [
		ClientController,
		ClientIntakeController,
	],
	providers: [ClientService, ClientMembershipService, ClientIntakeService],
	exports: [ClientService, ClientMembershipService, ClientIntakeService],
})
export class ClientModule {}
