import { Module } from '@nestjs/common';
import { EventPublisherService } from './event-publisher.service';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigModule, ConfigService } from '../config';
import { EVENTS_EXCHANGE } from './events';

@Module({
	controllers: [],
	providers: [EventPublisherService],
	// RabbitMQModule re-exported so consumers (e.g. HealthModule) can inject AmqpConnection.
	exports: [EventPublisherService, RabbitMQModule],
	imports: [
		RabbitMQModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				uri: config.rabbitmqConfig.url,
				exchanges: [
					{
						name: EVENTS_EXCHANGE,
						type: 'topic',
						options: { durable: true },
					},
				],
				connectionInitOptions: { wait: false },
				enableControllerDiscovery: false,
			}),
		}),
	],
})
export class MessagingModule {}
