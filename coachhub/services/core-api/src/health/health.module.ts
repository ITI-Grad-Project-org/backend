import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { MessagingModule } from '../messaging/messaging.module';
import { HealthController } from './health.controller';

@Module({
	imports: [TerminusModule, MessagingModule],
	controllers: [HealthController],
})
export class HealthModule {}
