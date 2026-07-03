package com.coachhub.ai.rabbitmq;

import com.fasterxml.jackson.databind.JsonNode;

public record EventEnvelope(
				String tenantId,
				String correlationId,
				String messageType,
				String timestamp,
				String schemaVersion,
				JsonNode payload
) {
}
