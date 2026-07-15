package com.coachhub.notification.rabbitmq;

import com.coachhub.notification.config.RabbitMqConfig;
import com.coachhub.notification.rabbitmq.payload.ClientInvitedPayload;
import com.coachhub.notification.rabbitmq.payload.PasswordResetPayload;
import com.coachhub.notification.service.email.EmailService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class NotificationEventListener {
	private static final Logger log = LoggerFactory.getLogger(NotificationEventListener.class);

	private final EmailService emailService;
	private final ObjectMapper objectMapper;

	@RabbitListener(queues = RabbitMqConfig.QUEUE)
	public void onEvent(EventEnvelope event) {
		log.info("received {} (correlationId={})", event.messageType(), event.correlationId());

		switch (event.messageType()) {
			case "client.invited" -> {
				ClientInvitedPayload clientInvitedPayload = objectMapper.convertValue(event.payload(),
								ClientInvitedPayload.class);
				emailService.sendClientInvite(clientInvitedPayload);
			}
			case "password.reset" -> {
				PasswordResetPayload passwordResetPayload = objectMapper.convertValue(event.payload(),
								PasswordResetPayload.class);
				emailService.sendPasswordReset(passwordResetPayload);
			}
			// case "plan.assigned"  -> ...
			// case "checkin.due"    -> ...
			// case "message.sent"   -> ...
			default -> log.warn("unknown message type {}", event.messageType());
		}
	}
}
