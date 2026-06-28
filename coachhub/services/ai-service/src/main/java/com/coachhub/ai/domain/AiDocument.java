package com.coachhub.ai.domain;

import com.coachhub.ai.rabbitmq.payload.AiRequestedPayload;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "ai_requests")
public class AiDocument {
	@Id
	private String id;
	@Indexed(unique = true)
	private String requestId;   // business id carried by the event
	private String tenantId;
	private String clientId;
	private String coachId;
	private String kind;
	private String prompt;
	private Status status;
	private String result;
	private String error;
	private Instant createdAt;
	private Instant completedAt;

	protected AiDocument() { /* for Spring Data */ }

	public static AiDocument received(AiRequestedPayload p, String tenantId) {
		AiDocument r = new AiDocument();
		r.requestId = p.requestId();
		r.tenantId = tenantId;
		r.clientId = p.clientId();
		r.coachId = p.coachId();
		r.kind = p.kind();
		r.prompt = p.prompt();
		r.status = Status.PROCESSING;
		r.createdAt = Instant.now();
		return r;
	}

	public void markSucceeded(String result) {
		this.status = Status.SUCCEEDED;
		this.result = result;
		this.completedAt = Instant.now();
	}

	public void markFailed(String error) {
		this.status = Status.FAILED;
		this.error = error;
		this.completedAt = Instant.now();
	}

	public String getRequestId() {return requestId;}

	public Status getStatus() {return status;}

	public enum Status {PROCESSING, SUCCEEDED, FAILED}
}
