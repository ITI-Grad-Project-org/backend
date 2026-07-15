package com.coachhub.notification.service.email;

import com.coachhub.notification.rabbitmq.payload.ClientInvitedPayload;
import com.coachhub.notification.rabbitmq.payload.PasswordResetPayload;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

@Service
@RequiredArgsConstructor
public class EmailService {
	private static final Logger log = LoggerFactory.getLogger(EmailService.class);
	private static final String FROM = "no-reply@coachhub.app";

	private final JavaMailSender mailSender;
	private final TemplateEngine templateEngine;

	public void sendClientInvite(ClientInvitedPayload payload) {
		Context ctx = new Context();
		ctx.setVariable("clientName", payload.clientName() != null ? payload.clientName() : "there");
		ctx.setVariable("coachName", payload.coachName());
		ctx.setVariable("acceptUrl", payload.acceptUrl());

		String html = templateEngine.process("client-invited", ctx);
		send(payload.clientEmail(), payload.coachName() + " invited you to CoachHub", html);
	}

	public void sendPasswordReset(PasswordResetPayload payload) {
		Context ctx = new Context();
		ctx.setVariable("name", payload.name() != null && !payload.name().isBlank() ? payload.name() : "there");
		ctx.setVariable("resetUrl", payload.resetUrl());

		String html = templateEngine.process("password-reset", ctx);
		send(payload.email(), "Reset your CoachHub password", html);
	}

	private void send(String to, String subject, String html) {
		try {
			MimeMessage message = mailSender.createMimeMessage();
			MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
			helper.setFrom(FROM);
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
