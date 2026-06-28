package com.coachhub.ai.rabbitmq.payload;

public record AiRequestedPayload(
				String requestId,
				String clientId,
				String coachId,
				String coachEmail,
				String kind,
				String prompt
) {
}
