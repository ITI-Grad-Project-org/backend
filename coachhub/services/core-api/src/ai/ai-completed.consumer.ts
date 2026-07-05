import { Injectable, Logger } from '@nestjs/common';
import { AiGateway } from './ai.gateway';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import {
	AiCompletedPayload,
	EventEnvelope,
	EVENTS_EXCHANGE,
	EventType,
} from '../messaging/events';

@Injectable()
export class AiCompletedConsumer {
	private readonly logger = new Logger(AiCompletedConsumer.name);

	constructor(private readonly gateway: AiGateway) {}

	@RabbitSubscribe({
		exchange: EVENTS_EXCHANGE,
		routingKey: EventType.AI_COMPLETED,
		queue: 'core-api.ai-completed.q',
		queueOptions: { durable: true },
	})
	async handleAiCompleted(envelope: EventEnvelope<AiCompletedPayload>) {
		const { payload } = envelope;
		this.logger.debug(
			`ai.completed received (requestId=${payload.requestId}, correlationId=${envelope.correlationId})`,
		);
		this.gateway.pushCompleted(payload);
	}
}
