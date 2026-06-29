package com.coachhub.ai.rabbitmq.payload;

public record AiCompletedPayload(
				String requestId,
				String clientId,
				String coachId,
				String coachEmail,
				String status,
				String summary
) {
}
