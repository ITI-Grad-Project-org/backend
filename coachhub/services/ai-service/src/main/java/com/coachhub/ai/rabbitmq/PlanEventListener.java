package com.coachhub.ai.rabbitmq;

import com.coachhub.ai.config.RabbitMqConfig;
import com.coachhub.ai.rabbitmq.payload.AiPlanRequestedPayload;
import com.coachhub.ai.service.plan.PlanGenerationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

/**
 * Consumes {@code ai.plan.requested} from its own queue, so a slow programme generation cannot sit
 * in front of an interactive chat question.
 */
@Component
public class PlanEventListener {
	private static final Logger log = LoggerFactory.getLogger(PlanEventListener.class);

	private static final String PLAN_REQUESTED = "ai.plan.requested";

	private final PlanGenerationService planService;
	private final ObjectMapper objectMapper;

	public PlanEventListener(PlanGenerationService planService, ObjectMapper objectMapper) {
		this.planService = planService;
		this.objectMapper = objectMapper;
	}

	@RabbitListener(queues = RabbitMqConfig.PLAN_QUEUE)
	public void onEvent(EventEnvelope event) {
		log.info("received {} (correlationId={})", event.messageType(), event.correlationId());

		if (!PLAN_REQUESTED.equals(event.messageType())) {
			// The queue binds one routing key, so this means someone bound another or
			// published by hand. Log and ack: requeuing a message nothing here handles
			// only spins.
			log.warn("no handler for messageType={} on {}", event.messageType(), RabbitMqConfig.PLAN_QUEUE);
			return;
		}

		// A payload this service cannot read is a poison message, not a transient
		// fault — letting it throw sends it to the DLQ after the configured retries,
		// which is where a malformed message belongs.
		AiPlanRequestedPayload payload =
						objectMapper.convertValue(event.payload(), AiPlanRequestedPayload.class);
		planService.process(payload, event.tenantId(), event.correlationId());
	}
}
