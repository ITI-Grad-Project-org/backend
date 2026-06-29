package com.coachhub.ai.rabbitmq;

import com.coachhub.ai.config.RabbitMqConfig;
import com.coachhub.ai.rabbitmq.payload.AiRequestedPayload;
import com.coachhub.ai.service.gemini.GeminiService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class EventListener {
	private static final Logger log = LoggerFactory.getLogger(EventListener.class);

	private final GeminiService aiService;
	private final ObjectMapper objectMapper;

	public EventListener(GeminiService aiService, ObjectMapper objectMapper) {
		this.aiService = aiService;
		this.objectMapper = objectMapper;
	}

	@RabbitListener(queues = RabbitMqConfig.QUEUE)
	public void onEvent(EventEnvelope event) {
		log.info("received {} (correlationId={})", event.messageType(), event.correlationId());

		if ("ai.requested".equals(event.messageType())) {
			AiRequestedPayload payload =
							objectMapper.convertValue(event.payload(), AiRequestedPayload.class);
			aiService.process(payload, event.tenantId(), event.correlationId());
		} else {
			log.warn("no handler for messageType={}", event.messageType());
		}
	}
}
