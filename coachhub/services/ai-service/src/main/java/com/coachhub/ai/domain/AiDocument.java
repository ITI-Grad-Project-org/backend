package com.coachhub.ai.domain;

import com.coachhub.ai.rabbitmq.payload.AiPlanRequestedPayload;
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
	/** Plan requests only: the client is identified by membership, not by client id. */
	private String membershipId;
	/** Plan requests only: the {@code ai_plan_suggestions} row in core-api this belongs to. */
	private String suggestionId;
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

	/**
	 * A plan generation, sharing this collection with chat requests.
	 *
	 * <p>The unique index on {@code requestId} is the whole point: {@code ai.plan.requested} is
	 * delivered at least once, and a redelivery that got as far as Gemini would be a second full
	 * generation — the most expensive call this service makes — for an answer core-api already has.
	 *
	 * <p>The prompt is stored rather than rebuilt because it is the only record of what the model was
	 * actually told. Regenerating it later would show today's library, not the one it chose from.
	 */
	public static AiDocument planRequested(AiPlanRequestedPayload p, String tenantId, String prompt) {
		AiDocument r = new AiDocument();
		r.requestId = p.requestId();
		r.tenantId = tenantId;
		r.membershipId = p.membershipId();
		r.suggestionId = p.suggestionId();
		r.coachId = p.coachId();
		r.kind = "plan:" + p.kind();
		r.prompt = prompt;
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
