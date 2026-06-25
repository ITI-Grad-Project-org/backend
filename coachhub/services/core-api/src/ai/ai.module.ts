import { Module } from '@nestjs/common';
import { AiService } from './ai.service';

// Async job-ticket client to ai-service over RabbitMQ
@Module({
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
