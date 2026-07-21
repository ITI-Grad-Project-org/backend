package com.coachhub.notification.service.email;

import com.coachhub.notification.rabbitmq.payload.ClientInvitedPayload;
import com.coachhub.notification.rabbitmq.payload.ClientRequestDecidedPayload;
import com.coachhub.notification.rabbitmq.payload.ClientRequestedPayload;
import com.coachhub.notification.rabbitmq.payload.PasswordResetPayload;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

@Service
@RequiredArgsConstructor
public class EmailService {
	private static final Logger log = LoggerFactory.getLogger(EmailService.class);

	/**
	 * Must be an address the SMTP provider lets us send as. Gmail only accepts the
	 * authenticated account (or a verified alias) and silently rewrites anything
	 * else, so this is configuration rather than a constant.
	 */
	@Value("${coachhub.mail.from:no-reply@coachhub.app}")
	private String from;

	private final JavaMailSender mailSender;
	private final TemplateEngine templateEngine;

	public void sendClientInvite(ClientInvitedPayload payload) {
		Context ctx = new Context();
		ctx.setVariable("clientName", payload.clientName() != null ? payload.clientName() : "there");
		ctx.setVariable("coachName", payload.coachName());
		ctx.setVariable("otp", payload.otp());

		String html = templateEngine.process("client-invited", ctx);
		send(payload.clientEmail(), payload.coachName() + " invited you to CoachHub", html);
	}

	/** Goes to the coach: someone asked to train with them. */
	public void sendJoinRequestReceived(ClientRequestedPayload payload) {
		String clientName = blankToDefault(payload.clientName(), "A new client");

		Context ctx = new Context();
		ctx.setVariable("clientName", clientName);
		ctx.setVariable("coachName", blankToDefault(payload.coachName(), "there"));
		ctx.setVariable("message", payload.message());
		ctx.setVariable("requestsUrl", payload.requestsUrl());

		String html = templateEngine.process("join-request-received", ctx);
		send(payload.coachEmail(), clientName + " wants to train with you", html);
	}

	/** Goes to the client: the coach let them in. */
	public void sendJoinRequestApproved(ClientRequestDecidedPayload payload) {
		Context ctx = new Context();
		ctx.setVariable("clientName", blankToDefault(payload.clientName(), "there"));
		ctx.setVariable("coachName", payload.coachName());
		ctx.setVariable("tenantName", payload.tenantName());
		ctx.setVariable("otp", payload.otp());

		String html = templateEngine.process("join-request-approved", ctx);
		send(payload.clientEmail(), payload.coachName() + " accepted your request", html);
	}

	/** Goes to the client: the coach turned them down. */
	public void sendJoinRequestRejected(ClientRequestDecidedPayload payload) {
		Context ctx = new Context();
		ctx.setVariable("clientName", blankToDefault(payload.clientName(), "there"));
		ctx.setVariable("coachName", payload.coachName());
		ctx.setVariable("actionUrl", payload.actionUrl());

		String html = templateEngine.process("join-request-rejected", ctx);
		send(payload.clientEmail(), "An update on your CoachHub request", html);
	}

	private String blankToDefault(String value, String fallback) {
		return value != null && !value.isBlank() ? value : fallback;
	}

	public void sendPasswordReset(PasswordResetPayload payload) {
		Context ctx = new Context();
		ctx.setVariable("name", payload.name() != null && !payload.name().isBlank() ? payload.name() : "there");
		ctx.setVariable("otp", payload.otp());
		ctx.setVariable("expiresInMinutes", payload.expiresInMinutes() != null ? payload.expiresInMinutes() : 10);

		String html = templateEngine.process("password-reset", ctx);
		send(payload.email(), "Reset your CoachHub password", html);
	}

	private void send(String to, String subject, String html) {
		try {
			MimeMessage message = mailSender.createMimeMessage();
			MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
			helper.setFrom(from);
			helper.setTo(to);
			helper.setSubject(subject);
			helper.setText(html, true);
			mailSender.send(message);
			log.info("email sent to {}", to);
		} catch (Exception e) {
			throw new RuntimeException("failed to send email to " + to, e);
		}
	}
}
