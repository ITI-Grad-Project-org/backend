package com.coachhub.ai.service.client;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

public class GeminiDtos {
	private GeminiDtos() {}

	@JsonInclude(JsonInclude.Include.NON_NULL)
	public record GeminiRequest(List<Content> contents, GenerationConfig generationConfig) {

		public static GeminiRequest of(String prompt, GenerationConfig generationConfig) {
			return new GeminiRequest(List.of(new Content(List.of(new Part(prompt)))), generationConfig);
		}

		public record Content(List<Part> parts) {}

		public record Part(String text) {}
	}

	/**
	 * Sampling and output-format controls.
	 *
	 * <p>Null fields are omitted from the request body. That matters: {@code responseSchema: null}
	 * is not the same thing to the API as an absent key, and every field here has a model default
	 * that is better than a zero value we made up.
	 */
	@JsonInclude(JsonInclude.Include.NON_NULL)
	public record GenerationConfig(
					Double temperature,
					Integer maxOutputTokens,
					String responseMimeType,
					Map<String, Object> responseSchema,
					ThinkingConfig thinkingConfig) {

		static final String JSON_MIME_TYPE = "application/json";

		/** Free-text answers — no schema, no forced mime type. */
		public static GenerationConfig prose(GeminiProperties.Sampling sampling) {
			return new GenerationConfig(
							sampling.temperature(),
							sampling.maxOutputTokens(),
							null,
							null,
							ThinkingConfig.of(sampling.thinkingBudget()));
		}

		/**
		 * Schema-constrained JSON.
		 *
		 * <p>Both fields are needed. {@code responseMimeType} alone stops the model wrapping its
		 * answer in a markdown fence; the schema is what stops it inventing field names. Asking for
		 * JSON in the prompt and parsing what comes back is the thing this replaces.
		 *
		 * @param schema an OpenAPI-subset schema. Gemini spells the {@code type} values in upper
		 *     case — {@code OBJECT}, {@code ARRAY}, {@code STRING}, {@code INTEGER}, {@code NUMBER},
		 *     {@code BOOLEAN} — and honours {@code propertyOrdering}, which is worth setting because
		 *     field order affects how consistently the model fills a long object.
		 */
		public static GenerationConfig json(
						GeminiProperties.Sampling sampling, Map<String, Object> schema) {
			return new GenerationConfig(
							sampling.temperature(),
							sampling.maxOutputTokens(),
							JSON_MIME_TYPE,
							schema,
							ThinkingConfig.of(sampling.thinkingBudget()));
		}

		/** True when this config asked for JSON, which decides how a truncated answer is treated. */
		boolean expectsJson() {
			return JSON_MIME_TYPE.equals(responseMimeType);
		}
	}

	@JsonInclude(JsonInclude.Include.NON_NULL)
	public record ThinkingConfig(Integer thinkingBudget) {

		/** @return null when unset, so the whole object is omitted and the model picks its own budget. */
		static ThinkingConfig of(Integer thinkingBudget) {
			return thinkingBudget == null ? null : new ThinkingConfig(thinkingBudget);
		}
	}

	public record GeminiResponse(
					List<Candidate> candidates, PromptFeedback promptFeedback, UsageMetadata usageMetadata) {

		/**
		 * @param finishReason STOP on a complete answer; MAX_TOKENS, SAFETY or RECITATION when the
		 *     model stopped early. Worth reading even when text came back — a truncated answer is
		 *     still a populated {@code parts} array.
		 */
		public record Candidate(Content content, String finishReason) {}

		public record Content(List<Part> parts) {}

		public record Part(String text) {}

		/** Set when the *prompt* was rejected outright, in which case there are no candidates. */
		public record PromptFeedback(String blockReason) {}

		public record UsageMetadata(
						Integer promptTokenCount,
						Integer candidatesTokenCount,
						Integer thoughtsTokenCount,
						Integer totalTokenCount) {}
	}
}
