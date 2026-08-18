package com.coachhub.ai.rabbitmq.payload;

/**
 * A request to design one full program for one client.
 *
 * <p>Carries everything generation needs, because it has to: core-api and ai-service share no
 * synchronous path, so there is nothing to call back to for the parts that were left out.
 *
 * @param requestId doubles as the correlationId for the whole exchange
 * @param suggestionId the {@code ai_plan_suggestions} row this fills in
 * @param kind {@code training} or {@code nutrition}
 */
public record AiPlanRequestedPayload(
				String requestId,
				String suggestionId,
				String membershipId,
				String coachId,
				String kind,
				PlanContext context,
				PlanCandidates candidates) {

	public static final String TRAINING = "training";
	public static final String NUTRITION = "nutrition";

	public boolean isTraining() {
		return TRAINING.equals(kind);
	}
}
