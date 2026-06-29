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
	MessageConverter jsonMessageConverter() {
		return new Jackson2JsonMessageConverter();
	}
}
