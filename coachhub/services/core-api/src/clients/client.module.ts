import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientIntakeController } from './client-intake.controller';
import { ClientIntakeService } from './client-intake.service';
import { ClientMembershipService } from './client-membership.service';
import { ClientController } from './client.controller';
import { MembershipsController } from './memberships.controller';
import { ClientProfileController } from './client-profile.controller';
import { ClientService } from './client.service';
import { ClientIntake } from './entities/client-intake.entity';
import { ClientMembership } from './entities/client-membership.entity';
import { Client } from './entities/client.entity';
import { S3UploadModule } from '../s3-upload/s3-upload.module';

@Module({
	imports: [
		TypeOrmModule.forFeature([Client, ClientMembership, ClientIntake]),
		S3UploadModule,
	],
	controllers: [
		ClientController,
		MembershipsController,
		ClientProfileController,
		ClientIntakeController,
	],
	providers: [ClientService, ClientMembershipService, ClientIntakeService],
	exports: [ClientService, ClientMembershipService, ClientIntakeService],
})
export class ClientModule {}
