package com.coachhub.ai.config;

import org.springframework.amqp.core.*;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMqConfig {

	public static final String EXCHANGE = "coachhub.events";
	public static final String QUEUE = "ai.q";
	public static final String DLX = "coachhub.events.dlx";
	public static final String DLQ = "ai.dlq";

	/**
	 * Plan generation gets its own queue rather than another binding on {@code ai.q}.
	 *
	 * <p>They are not the same kind of work. A chat question is interactive and answers in seconds;
	 * a full programme is a long call with a large prompt and a large response. Sharing one queue
	 * means every plan blocks every question behind it, and the two cannot be scaled, retried or
	 * dead-lettered apart. Separating them costs four beans.
	 */
	public static final String PLAN_QUEUE = "ai.plan.q";
	public static final String PLAN_DLQ = "ai.plan.dlq";

	@Bean
	TopicExchange eventsExchange() {
		return ExchangeBuilder.topicExchange(EXCHANGE).durable(true).build();
	}

	@Bean
	Queue aiQueue() {
		return QueueBuilder.durable(QUEUE)
		                   .deadLetterExchange(DLX)
		                   .deadLetterRoutingKey(DLQ)
		                   .build();
	}

	@Bean
	Binding bindAiRequested() {
		return BindingBuilder.bind(aiQueue()).to(eventsExchange()).with("ai.requested");
	}

	@Bean
	Queue aiPlanQueue() {
		return QueueBuilder.durable(PLAN_QUEUE)
		                   .deadLetterExchange(DLX)
		                   .deadLetterRoutingKey(PLAN_DLQ)
		                   .build();
	}

	@Bean
	Binding bindAiPlanRequested() {
		return BindingBuilder.bind(aiPlanQueue()).to(eventsExchange()).with("ai.plan.requested");
	}

	// ── Dead-letter setup ────────────────────────────────────────────────────
	@Bean
	DirectExchange deadLetterExchange() {
		return new DirectExchange(DLX, true, false);
	}

	@Bean
	Queue aiDeadLetterQueue() {
		return QueueBuilder.durable(DLQ).build();
	}

	@Bean
	Binding bindAiDeadLetter() {
		return BindingBuilder.bind(aiDeadLetterQueue()).to(deadLetterExchange()).with(DLQ);
	}

	@Bean
	Queue aiPlanDeadLetterQueue() {
		return QueueBuilder.durable(PLAN_DLQ).build();
	}

	@Bean
	Binding bindAiPlanDeadLetter() {
		return BindingBuilder.bind(aiPlanDeadLetterQueue()).to(deadLetterExchange()).with(PLAN_DLQ);
	}

	@Bean
	MessageConverter jsonMessageConverter() {
		return new Jackson2JsonMessageConverter();
	}
}
