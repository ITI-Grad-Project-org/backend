import { Injectable } from '@nestjs/common';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { randomUUID } from 'node:crypto';
import { AiRequestedPayload, EventType } from '../messaging/events';

interface RequestAiInput {
	/**
	 * Taken from the caller's verified access token. This becomes the envelope's
	 * tenant, which is what ai-service scopes knowledge-base retrieval by — so it
	 * must never be defaulted or accepted from a request body.
	 */
	tenantId: string;
	clientId: string | null;
	/** Already authorized by the caller — see AiSubjectService. */
	membershipId: string | null;
	coachId: string | null;
	coachEmail: string | null;
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
			membershipId: input.membershipId,
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
