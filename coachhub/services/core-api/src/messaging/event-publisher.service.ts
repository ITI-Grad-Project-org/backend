import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EventEnvelope, EventType, SCHEMA_VERSION } from './events';
import { randomUUID } from 'node:crypto';

interface PublishOptions {
	tenantId: string;
	/** Pass through an existing correlationId to keep a trace across services. */
	correlationId?: string;
}

@Injectable()
export class EventPublisherService {
	private readonly logger = new Logger(EventPublisherService.name);

	constructor(private readonly ampq: AmqpConnection) {}

	async publish<T>(
		messageType: EventType,
		payload: T,
		options: PublishOptions,
	): Promise<String> {
		const envelope: EventEnvelope<T> = {
			tenantId: options.tenantId,
			correlationId: options.correlationId ?? randomUUID(),
			payload,
			messageType,
			timestamp: new Date().toISOString(),
			schemaVersion: SCHEMA_VERSION,
		};

		await this.ampq.publish('coachhub.events', messageType, envelope, {
			persistent: true,
			contentType: 'application/json',
			messageId: randomUUID(),
			timestamp: Math.floor(Date.now() / 1000),
		});

		this.logger.debug(
			`published ${messageType} (correlationId=${envelope.correlationId})`,
		);

		return envelope.correlationId;
	}
}
