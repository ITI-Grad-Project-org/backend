import { Injectable } from '@nestjs/common';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { randomUUID } from 'node:crypto';
import { AiRequestedPayload, EventType } from '../messaging/events';

interface RequestAiInput {
	tenantId: string;
	clientId: string;
	coachId: string;
	coachEmail: string;
	kind: string;
	prompt: string;
}

@Injectable()
export class AiService {
	constructor(private readonly event: EventPublisherService) {}

	async dispatch(input: RequestAiInput) {
		const requestId = randomUUID();
		const payload: AiRequestedPayload = {
			requestId,
			clientId: input.clientId,
			coachId: input.coachId,
			coachEmail: input.coachEmail,
			kind: input.kind,
			prompt: input.prompt,
		};

		await this.event.publish(EventType.AI_REQUESTED, payload, {
			tenantId: input.tenantId,
		});

		return requestId;
	}
}
