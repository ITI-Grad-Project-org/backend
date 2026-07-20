package com.coachhub.notification;

import com.coachhub.notification.rabbitmq.payload.ClientRequestDecidedPayload;
import com.coachhub.notification.rabbitmq.payload.ClientRequestedPayload;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Guards the contract between core-api's published payloads and this service:
 * the JSON below is copied field-for-field from the TypeScript interfaces.
 */
@SpringBootTest
class JoinRequestEmailTest {

	@Autowired
	private TemplateEngine templateEngine;

	private TemplateEngine engine() {
		return templateEngine;
	}

	@Test
	void requestedPayloadDeserialisesAndRenders() {
		Map<String, Object> json = new HashMap<>();
		json.put("membershipId", "m-1");
		json.put("clientId", "c-1");
		json.put("clientName", "Sara Adel");
		json.put("clientEmail", "sara@example.com");
		json.put("coachId", "co-1");
		json.put("coachEmail", "marco@example.com");
		json.put("coachName", "Marco Lewis");
		json.put("tenantName", "Marco Strength");
		json.put("message", "Half marathon in October");
		json.put("requestsUrl", "https://app.test/coach/requests");

		ClientRequestedPayload p = new ObjectMapper().convertValue(json, ClientRequestedPayload.class);
		assertEquals("Sara Adel", p.clientName());
		assertEquals("marco@example.com", p.coachEmail());
		assertEquals("https://app.test/coach/requests", p.requestsUrl());

		Context ctx = new Context();
		ctx.setVariable("clientName", p.clientName());
		ctx.setVariable("coachName", p.coachName());
		ctx.setVariable("message", p.message());
		ctx.setVariable("requestsUrl", p.requestsUrl());
		String html = engine().process("join-request-received", ctx);

		assertTrue(html.contains("Sara Adel"), "client name missing");
		assertTrue(html.contains("Marco Lewis"), "coach name missing");
		assertTrue(html.contains("Half marathon in October"), "note missing");
		assertTrue(html.contains("https://app.test/coach/requests"), "link missing");
	}

	@Test
	void requestedTemplateOmitsNoteBlockWhenMessageNull() {
		Context ctx = new Context();
		ctx.setVariable("clientName", "Sara");
		ctx.setVariable("coachName", "Marco");
		ctx.setVariable("message", null);
		ctx.setVariable("requestsUrl", "https://app.test/coach/requests");

		String html = engine().process("join-request-received", ctx);
		assertFalse(html.contains("&ldquo;"), "empty quote block rendered");
		assertTrue(html.contains("Sara"));
	}

	@Test
	void decidedPayloadDeserialisesAndRenders() {
		Map<String, Object> json = new HashMap<>();
		json.put("membershipId", "m-1");
		json.put("clientId", "c-1");
		json.put("clientEmail", "sara@example.com");
		json.put("clientName", "Sara Adel");
		json.put("coachId", "co-1");
		json.put("coachName", "Marco Lewis");
		json.put("tenantName", "Marco Strength");
		json.put("actionUrl", "https://app.test/client/intake");

		ClientRequestDecidedPayload p =
						new ObjectMapper().convertValue(json, ClientRequestDecidedPayload.class);
		assertEquals("sara@example.com", p.clientEmail());
		assertEquals("https://app.test/client/intake", p.actionUrl());

		Context ctx = new Context();
		ctx.setVariable("clientName", p.clientName());
		ctx.setVariable("coachName", p.coachName());
		ctx.setVariable("tenantName", p.tenantName());
		ctx.setVariable("actionUrl", p.actionUrl());

		String approved = engine().process("join-request-approved", ctx);
		assertTrue(approved.contains("Marco Lewis"));
		assertTrue(approved.contains("Marco Strength"));
		assertTrue(approved.contains("https://app.test/client/intake"));

		String rejected = engine().process("join-request-rejected", ctx);
		assertTrue(rejected.contains("Marco Lewis"));
		assertTrue(rejected.contains("https://app.test/client/intake"));
	}
}
