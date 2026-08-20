import { Module } from '@nestjs/common';
import { JoinRequestService } from './join-request.service';
import { ClientJoinRequestController } from './client-join-request.controller';
import { CoachJoinRequestController } from './coach-join-request.controller';
import { ClientModule } from '../clients/client.module';
import { TenantModule } from '../tenant/tenant.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ConfigModule } from '../config';
import { OtpProvider } from '../common';
import { BillingModule } from '../billing/billing.module';

@Module({
	controllers: [ClientJoinRequestController, CoachJoinRequestController],
	providers: [JoinRequestService, OtpProvider],
	imports: [
		ClientModule,
		TenantModule,
		MessagingModule,
		ConfigModule,
		BillingModule,
	],
	exports: [JoinRequestService],
})
export class JoinRequestModule {}
