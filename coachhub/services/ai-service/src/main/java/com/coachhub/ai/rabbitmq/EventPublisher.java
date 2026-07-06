package com.coachhub.ai.rabbitmq;

import com.coachhub.ai.config.RabbitMqConfig;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class EventPublisher {
	private static final String SCHEMA_VERSION = "1.0.0";

	private final RabbitTemplate rabbitTemplate;

	public EventPublisher(RabbitTemplate rabbitTemplate) {
		this.rabbitTemplate = rabbitTemplate;
	}

	public String publish(String messageType, Object payload, String tenantId, String correlationId) {
		String corr = (correlationId != null) ? correlationId : UUID.randomUUID().toString();

		Map<String, Object> envelope = new LinkedHashMap<>();
		envelope.put("tenantId", tenantId);
		envelope.put("correlationId", corr);
		envelope.put("messageType", messageType);
		envelope.put("timestamp", Instant.now().toString());
		envelope.put("schemaVersion", SCHEMA_VERSION);
		envelope.put("payload", payload);

		// Per the event contract, messageType IS the topic routing key
		// (e.g. "ai.completed" → consumers bind on that key). Publishing with the
		// queue name would match no binding and silently drop the message.
		rabbitTemplate.convertAndSend(RabbitMqConfig.EXCHANGE, messageType, envelope);
		return corr;
	}
}
