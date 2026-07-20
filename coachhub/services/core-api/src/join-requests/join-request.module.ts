import { Module } from '@nestjs/common';
import { JoinRequestService } from './join-request.service';
import { ClientJoinRequestController } from './client-join-request.controller';
import { CoachJoinRequestController } from './coach-join-request.controller';
import { ClientModule } from '../clients/client.module';
import { TenantModule } from '../tenant/tenant.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ConfigModule } from '../config';

@Module({
	controllers: [ClientJoinRequestController, CoachJoinRequestController],
	providers: [JoinRequestService],
	imports: [ClientModule, TenantModule, MessagingModule, ConfigModule],
	exports: [JoinRequestService],
})
export class JoinRequestModule {}
