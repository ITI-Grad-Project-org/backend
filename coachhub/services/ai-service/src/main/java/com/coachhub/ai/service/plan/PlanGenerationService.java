package com.coachhub.ai.service.plan;

import com.coachhub.ai.domain.AiDocument;
import com.coachhub.ai.domain.AiRequestRepository;
import com.coachhub.ai.rabbitmq.EventPublisher;
import com.coachhub.ai.rabbitmq.payload.AiPlanCompletedPayload;
import com.coachhub.ai.rabbitmq.payload.AiPlanRequestedPayload;
import com.coachhub.ai.rabbitmq.payload.PlanWarning;
import com.coachhub.ai.service.client.GeminiClient;
import com.coachhub.ai.service.client.GeminiProperties;
import com.coachhub.ai.service.client.GeminiResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Designs one full training or nutrition programme and sends it back to core-api.
 *
 * <p>Nothing here decides whether a plan is usable. It reports what came back, what is wrong with
 * it, and what it cost; core-api owns the suggestion's state and makes that call.
 */
@Service
public class PlanGenerationService {
	private static final Logger log = LoggerFactory.getLogger(PlanGenerationService.class);

	private static final String PLAN_COMPLETED = "ai.plan.completed";

	private final GeminiClient gemini;
	private final GeminiProperties geminiProperties;
	private final PlanPromptBuilder promptBuilder;
	private final PlanValidator validator;
	private final AiRequestRepository repository;
	private final EventPublisher publisher;
	private final ObjectMapper objectMapper;

	public PlanGenerationService(GeminiClient gemini,
	                             GeminiProperties geminiProperties,
	                             PlanPromptBuilder promptBuilder,
	                             PlanValidator validator,
	                             AiRequestRepository repository,
	                             EventPublisher publisher,
	                             ObjectMapper objectMapper) {
		this.gemini = gemini;
		this.geminiProperties = geminiProperties;
		this.promptBuilder = promptBuilder;
		this.validator = validator;
		this.repository = repository;
		this.publisher = publisher;
		this.objectMapper = objectMapper;
	}

	public void process(AiPlanRequestedPayload payload, String tenantId, String correlationId) {
		String prompt = promptBuilder.build(payload);

		// Idempotency: at-least-once delivery means this can arrive twice, and the
		// duplicate would be a second full generation — by far the most expensive
		// call this service makes — for an answer core-api already has.
		AiDocument record =
						repository.findByRequestId(payload.requestId())
						          .orElseGet(() -> repository.save(
														  AiDocument.planRequested(payload, tenantId, prompt)));
		if (record.getStatus() == AiDocument.Status.SUCCEEDED) {
			log.info("plan request {} already succeeded — skipping (correlationId={})",
					payload.requestId(), correlationId);
			return;
		}

		long startedAt = System.nanoTime();
		GeminiResult result = null;
		try {
			Map<String, Object> schema = PlanResponseSchema.forKind(payload.kind());
			result = gemini.generateJson(prompt, schema);

			JsonNode plan = objectMapper.readTree(result.text());
			List<PlanWarning> warnings = validator.validate(plan, payload);
			long errors = warnings.stream().filter(PlanWarning::isError).count();

			record.markSucceeded(result.text());
			repository.save(record);

			log.info("plan {} generated for suggestion {} ({} warnings, {} blocking) in {}ms",
					payload.kind(), payload.suggestionId(), warnings.size(), errors,
					elapsedMs(startedAt));

			publish(AiPlanCompletedPayload.succeeded(payload, plan, warnings, meta(result, startedAt)),
					tenantId, correlationId);
		} catch (Exception ex) {
			// Deliberately not rethrown: a redelivery would publish a second
			// ai.plan.completed for the same suggestion, and retrying a prompt that
			// the model just refused or truncated rarely produces a different answer.
			// Transient-error retries belong behind the Gemini client.
			log.error("plan generation failed for suggestion {} (requestId={}): {}",
					payload.suggestionId(), payload.requestId(), ex.getMessage(), ex);
			record.markFailed(ex.getMessage());
			repository.save(record);

			publish(AiPlanCompletedPayload.failed(payload, describe(ex), meta(result, startedAt)),
					tenantId, correlationId);
		}
	}

	/**
	 * @return usage figures, kept even on failure — a request that burned the whole output budget
	 *     and then truncated is the expensive kind, and that is exactly when it is thrown away.
	 */
	private AiPlanCompletedPayload.ModelMeta meta(GeminiResult result, long startedAt) {
		if (result == null) {
			return new AiPlanCompletedPayload.ModelMeta(
							geminiProperties.model(), null, null, null, null, elapsedMs(startedAt));
		}
		return new AiPlanCompletedPayload.ModelMeta(
						geminiProperties.model(),
						result.finishReason(),
						result.promptTokens(),
						result.outputTokens(),
						result.totalTokens(),
						elapsedMs(startedAt));
	}

	/** The exception type carries information the message alone does not (a parse failure, say). */
	private static String describe(Exception ex) {
		String message = ex.getMessage();
		return message == null || message.isBlank()
						? ex.getClass().getSimpleName()
						: ex.getClass().getSimpleName() + ": " + message;
	}

	private static long elapsedMs(long startedAt) {
		return (System.nanoTime() - startedAt) / 1_000_000L;
	}

	private void publish(AiPlanCompletedPayload payload, String tenantId, String correlationId) {
		String corr = publisher.publish(PLAN_COMPLETED, payload, tenantId, correlationId);
		log.info("{} ({}) published for suggestion {} (correlationId={})",
				PLAN_COMPLETED, payload.status(), payload.suggestionId(), corr);
	}
}
