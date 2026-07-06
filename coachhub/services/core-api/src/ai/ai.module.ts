import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MessagingModule } from '../messaging/messaging.module';
import { AiService } from './ai.service';
import { AiCompletedConsumer } from './ai-completed.consumer';
import { AiGateway } from './ai.gateway';
import { ConfigService } from '../config';

@Module({
	imports: [ConfigModule, MessagingModule],
	providers: [AiService, AiCompletedConsumer, AiGateway, ConfigService],
})
export class AiModule {}
