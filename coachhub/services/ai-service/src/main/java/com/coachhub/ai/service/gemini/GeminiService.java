package com.coachhub.ai.service.gemini;

import com.coachhub.ai.domain.AiDocument;
import com.coachhub.ai.domain.AiRequestRepository;
import com.coachhub.ai.rabbitmq.EventPublisher;
import com.coachhub.ai.rabbitmq.payload.AiCompletedPayload;
import com.coachhub.ai.rabbitmq.payload.AiRequestedPayload;
import com.coachhub.ai.service.client.GeminiClient;
import com.coachhub.ai.service.rag.RagChunk;
import com.coachhub.ai.service.rag.RagProperties;
import com.coachhub.ai.service.rag.RagService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class GeminiService {
	private static final Logger log = LoggerFactory.getLogger(GeminiService.class);

	private final GeminiClient gemini;
	private final RagService rag;
	private final RagProperties ragProperties;
	private final AiRequestRepository repository;
	private final EventPublisher publisher;

	public GeminiService(GeminiClient gemini,
	                     RagService rag,
	                     RagProperties ragProperties,
	                     AiRequestRepository repository,
	                     EventPublisher publisher) {
		this.gemini = gemini;
		this.rag = rag;
		this.ragProperties = ragProperties;
		this.repository = repository;
		this.publisher = publisher;
	}

	public void process(AiRequestedPayload payload, String tenantId, String correlationId) {
		// Idempotency: ai.requested may be delivered more than once (at-least-once
		// delivery + listener retries). Reuse any existing record for this
		// requestId, and skip work that already completed successfully.
		AiDocument record = repository.findByRequestId(payload.requestId())
		                              .orElseGet(() -> repository.save(AiDocument.received(payload, tenantId)));
		if (record.getStatus() == AiDocument.Status.SUCCEEDED) {
			log.info("request {} already succeeded — skipping (correlationId={})",
					payload.requestId(), correlationId);
			return;
		}

		try {
			String prompt = buildGroundedPrompt(payload, tenantId);
			String summary = gemini.generate(prompt);

			record.markSucceeded(summary);
			repository.save(record);
			publish(payload, tenantId, correlationId, "succeeded", summary);
		} catch (Exception ex) {
			// Record the failure and notify downstream exactly once, then ack.
			// We deliberately do NOT rethrow: re-delivery would emit duplicate
			// ai.completed events. Transient-error retries belong behind the
			// Gemini client, not the broker.
			log.error("AI request {} failed: {}", payload.requestId(), ex.getMessage(), ex);
			record.markFailed(ex.getMessage());
			repository.save(record);
			publish(payload, tenantId, correlationId, "failed",
					"AI request failed: " + ex.getMessage());
		}
	}

	/** Builds a prompt grounded in the most relevant knowledge-base chunks. */
	private String buildGroundedPrompt(AiRequestedPayload payload, String tenantId) {
		List<RagChunk> context = retrieveContext(payload.prompt(), tenantId, payload.membershipId());
		if (context.isEmpty()) {
			return payload.prompt();
		}

		StringBuilder sb = new StringBuilder();
		sb.append("You are CoachHub's fitness-coaching assistant. ")
		  .append("Use the context below when it is relevant; if it doesn't help, ")
		  .append("answer from general knowledge.\n\n")
		  .append("=== Context ===\n");
		for (RagChunk chunk : context) {
			sb.append("- (").append(chunk.source()).append(") ").append(chunk.text()).append('\n');
		}
		sb.append("\n=== Request (kind: ").append(payload.kind()).append(") ===\n")
		  .append(payload.prompt());
		return sb.toString();
	}

	/**
	 * Retrieval must never break generation — degrade to no context on error.
	 *
	 * <p>The tenant comes from the message envelope and is passed through rather than resolved
	 * here: the knowledge base now holds each coach's own exercise library and client profiles, so
	 * this argument is the only thing standing between one coach's question and another's data.
	 */
	private List<RagChunk> retrieveContext(String query, String tenantId, String membershipId) {
		try {
			return rag.retrieve(query, tenantId, membershipId, ragProperties.topK());
		} catch (Exception ex) {
			log.warn("RAG retrieval failed, continuing without context: {}", ex.getMessage());
			return List.of();
		}
	}

	private void publish(AiRequestedPayload payload, String tenantId, String correlationId,
	                     String status, String summary) {
		String corr = publisher.publish(
				"ai.completed",
				new AiCompletedPayload(
						payload.requestId(),
						payload.clientId(),
						payload.coachId(),
						payload.coachEmail(),
						status,
						summary),
				tenantId,
				correlationId);
		log.info("ai.completed ({}) published for request {} (correlationId={})",
				status, payload.requestId(), corr);
	}
}
