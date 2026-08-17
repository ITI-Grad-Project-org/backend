package com.coachhub.ai.rabbitmq.payload;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/**
 * The proposal, on its way back to core-api to be stored and shown to the coach.
 *
 * <p>{@code status} says whether a plan was produced at all; it does not say whether the plan is
 * any good. That is what {@code warnings} is for, and deciding between {@code ready} and {@code
 * invalid} is core-api's call — this service reports what it found and does not set state it does
 * not own.
 *
 * @param plan the raw model output, forwarded as parsed JSON; null when {@code status} is {@code
 *     failed}
 */
public record AiPlanCompletedPayload(
				String requestId,
				String suggestionId,
				String membershipId,
				String coachId,
				String kind,
				String status,
				JsonNode plan,
				List<PlanWarning> warnings,
				String error,
				ModelMeta modelMeta) {

	public static final String SUCCEEDED = "succeeded";
	public static final String FAILED = "failed";

	public static AiPlanCompletedPayload succeeded(
					AiPlanRequestedPayload request,
					JsonNode plan,
					List<PlanWarning> warnings,
					ModelMeta modelMeta) {
		return new AiPlanCompletedPayload(
						request.requestId(),
						request.suggestionId(),
						request.membershipId(),
						request.coachId(),
						request.kind(),
						SUCCEEDED,
						plan,
						warnings == null ? List.of() : List.copyOf(warnings),
						null,
						modelMeta);
	}

	public static AiPlanCompletedPayload failed(
					AiPlanRequestedPayload request, String error, ModelMeta modelMeta) {
		return new AiPlanCompletedPayload(
						request.requestId(),
						request.suggestionId(),
						request.membershipId(),
						request.coachId(),
						request.kind(),
						FAILED,
						null,
						List.of(),
						error,
						modelMeta);
	}

	/**
	 * Cost and latency for one generation.
	 *
	 * <p>Sent on failures too — a request that burned 30,000 tokens and then truncated is the most
	 * expensive kind, and dropping the numbers exactly when they matter would hide it.
	 */
	public record ModelMeta(
					String model,
					String finishReason,
					Integer promptTokens,
					Integer outputTokens,
					Integer totalTokens,
					Long latencyMs) {}
}
