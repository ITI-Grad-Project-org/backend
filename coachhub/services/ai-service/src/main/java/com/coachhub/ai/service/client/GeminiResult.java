package com.coachhub.ai.service.client;

import com.coachhub.ai.service.client.GeminiDtos.GeminiResponse;

/**
 * What a generateContent call produced, with the metadata the caller needs to record it.
 *
 * <p>The token counts exist because {@code ai.plan.completed} reports them and because they are the
 * only way to see a prompt growing expensive before the bill does.
 */
public record GeminiResult(
				String text,
				String finishReason,
				Integer promptTokens,
				Integer outputTokens,
				Integer thoughtTokens,
				Integer totalTokens) {

	static GeminiResult of(String text, String finishReason, GeminiResponse.UsageMetadata usage) {
		if (usage == null) {
			return new GeminiResult(text, finishReason, null, null, null, null);
		}
		return new GeminiResult(
						text,
						finishReason,
						usage.promptTokenCount(),
						usage.candidatesTokenCount(),
						usage.thoughtsTokenCount(),
						usage.totalTokenCount());
	}
}
