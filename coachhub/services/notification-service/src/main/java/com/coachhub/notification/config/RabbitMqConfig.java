package com.coachhub.notification.config;

import org.springframework.amqp.core.*;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMqConfig {
	public static final String EXCHANGE = "coachhub.events";
	public static final String QUEUE = "notification.q";
	public static final String DLX = "coachhub.events.dlx";
	public static final String DLQ = "notification.dlq";

	@Bean
	TopicExchange eventsExchange() {
		return ExchangeBuilder.topicExchange(EXCHANGE).durable(true).build();
	}

	@Bean
	Queue notificationQueue() {
		return QueueBuilder.durable(QUEUE)
		                   .deadLetterExchange(DLX)
		                   .deadLetterRoutingKey(DLQ)
		                   .build();
	}

	// ── Events this service reacts to ────────────────────────────────────────
	@Bean
	Binding bindClientInvited() {
		return BindingBuilder.bind(notificationQueue()).to(eventsExchange()).with("client.invited");
	}

	@Bean
	Binding bindClientRequested() {
		return BindingBuilder.bind(notificationQueue()).to(eventsExchange()).with("client.requested");
	}

	@Bean
	Binding bindClientRequestApproved() {
		return BindingBuilder.bind(notificationQueue()).to(eventsExchange()).with("client.request.approved");
	}

	@Bean
	Binding bindClientRequestRejected() {
		return BindingBuilder.bind(notificationQueue()).to(eventsExchange()).with("client.request.rejected");
	}

	@Bean
	Binding bindPlanAssigned() {
		return BindingBuilder.bind(notificationQueue()).to(eventsExchange()).with("plan.assigned");
	}

	@Bean
	Binding bindCheckinDue() {
		return BindingBuilder.bind(notificationQueue()).to(eventsExchange()).with("checkin.due");
	}

	@Bean
	Binding bindMessageSent() {
		return BindingBuilder.bind(notificationQueue()).to(eventsExchange()).with("message.sent");
	}

	@Bean
	Binding bindPasswordReset() {
		return BindingBuilder.bind(notificationQueue()).to(eventsExchange()).with("password.reset");
	}

	// ── Dead-letter setup: messages that exhaust retries land here ───────────
	@Bean
	DirectExchange deadLetterExchange() {
		return new DirectExchange(DLX, true, false);
	}

	@Bean
	Queue deadLetterQueue() {
		return QueueBuilder.durable(DLQ).build();
	}

	@Bean
	Binding bindDeadLetter() {
		return BindingBuilder.bind(deadLetterQueue()).to(deadLetterExchange()).with(DLQ);
	}

	/**
	 * Single MessageConverter bean → Spring Boot auto-wires it into both the
	 * RabbitTemplate and the default listener container factory, so payloads
	 * (de)serialize as JSON.
	 */
	@Bean
	MessageConverter jsonMessageConverter() {
		return new Jackson2JsonMessageConverter();
	}
}
