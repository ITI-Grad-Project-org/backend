package com.coachhub.ai.rabbitmq.payload;

/**
 * A free-text question for the assistant.
 *
 * @param membershipId the client the question is about, when there is one. It is the retrieval
 *     scope, not decoration: core-api has already checked that the asker is allowed to ask about
 *     this client, and everything private to a client is filtered on it. Null means "no particular
 *     client", which retrieves only material tied to nobody.
 */
public record AiRequestedPayload(
				String requestId,
				String clientId,
				String membershipId,
				String coachId,
				String coachEmail,
				String kind,
				String prompt
) {
}
