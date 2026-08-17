package com.coachhub.ai.service.client;

import com.coachhub.ai.service.client.GeminiDtos.GeminiResponse;
import com.coachhub.ai.service.client.GeminiDtos.GenerationConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.Map;

@Component
public class GeminiClient {
	private static final Logger log = LoggerFactory.getLogger(GeminiClient.class);

	private static final String MAX_TOKENS = "MAX_TOKENS";
	private static final int TOO_MANY_REQUESTS = 429;
	private static final int REQUEST_TIMEOUT = 408;

	private final RestClient restClient;
	private final GeminiProperties properties;

	/**
	 * @param builder the auto-configured builder, which already carries the timeouts set by {@link
	 *     com.coachhub.ai.config.GeminiHttpConfig}. Deliberately not configured here: a request
	 *     factory set in this constructor would overwrite whatever the caller had installed, which
	 *     among other things silently disables {@code MockRestServiceServer}.
	 */
	public GeminiClient(RestClient.Builder builder, GeminiProperties properties) {
		this.restClient = builder.baseUrl(properties.baseUrl()).build();
		this.properties = properties;
	}

	/** Free-text generation, using the {@code gemini.chat} sampling profile. */
	public String generate(String prompt) {
		return generate(prompt, GenerationConfig.prose(properties.chat())).text();
	}

	/**
	 * Schema-constrained JSON generation, using the {@code gemini.json} sampling profile.
	 *
	 * @param schema an OpenAPI-subset schema; see {@link GenerationConfig#json}.
	 * @return the raw JSON text. Parsing and domain validation belong to the caller — this class
	 *     guarantees only that the string is a complete response, not that it means anything.
	 */
	public GeminiResult generateJson(String prompt, Map<String, Object> schema) {
		return generate(prompt, GenerationConfig.json(properties.json(), schema));
	}

	public GeminiResult generate(String prompt, GenerationConfig config) {
		return interpret(callWithRetries(prompt, config), config);
	}

	/**
	 * Calls generateContent, trying again when the failure is one that passes.
	 *
	 * <p>This is the only place a retry can live. The RabbitMQ listener deliberately does not rethrow
	 * — a redelivery would publish a second completion for the same suggestion — so without a retry
	 * here, a 503 that clears in two seconds costs a coach their whole plan and shows up as a failed
	 * suggestion they have to notice and repeat by hand.
	 *
	 * <p>Total time is bounded by the read timeout multiplied by the attempt count, plus backoff. Keep
	 * that product under core-api's pending-suggestion window or a plan can arrive after the request
	 * has already been written off as abandoned.
	 */
	private GeminiResponse callWithRetries(String prompt, GenerationConfig config) {
		int attempts = properties.retry().maxAttempts();
		RuntimeException lastFailure = null;

		for (int attempt = 1; attempt <= attempts; attempt++) {
			if (attempt > 1) {
				pause(properties.retry().backoffBefore(attempt).toMillis(), attempt, attempts, lastFailure);
			}
			try {
				return restClient
								.post()
								.uri("/models/{model}:generateContent", properties.model())
								.header("x-goog-api-key", properties.apiKey())
								.contentType(MediaType.APPLICATION_JSON)
								.body(GeminiDtos.GeminiRequest.of(prompt, config))
								.retrieve()
								.body(GeminiResponse.class);
			} catch (RestClientResponseException ex) {
				// A bad key, a retired model or a malformed request will fail exactly the
				// same way on every attempt. Retrying those just spends the caller's time.
				if (!isWorthRetrying(ex.getStatusCode())) {
					throw ex;
				}
				lastFailure = ex;
			} catch (ResourceAccessException ex) {
				// Connect or read timeout, connection reset — no response ever arrived, so
				// nothing was necessarily charged and trying again is reasonable.
				lastFailure = ex;
			}
		}

		throw lastFailure;
	}

	/** 429 and 5xx clear on their own; 4xx otherwise means the request itself is wrong. */
	private static boolean isWorthRetrying(HttpStatusCode status) {
		return status.is5xxServerError()
						|| status.value() == TOO_MANY_REQUESTS
						|| status.value() == REQUEST_TIMEOUT;
	}

	private void pause(long millis, int attempt, int attempts, RuntimeException cause) {
		log.warn(
				"Gemini attempt {} of {} failed ({}); retrying in {}ms",
				attempt - 1,
				attempts,
				cause == null ? "unknown" : cause.getMessage(),
				millis);
		try {
			Thread.sleep(millis);
		} catch (InterruptedException interrupted) {
			// A shutdown mid-backoff. Restore the flag and give up rather than swallow it,
			// so a draining pod stops instead of finishing a call nobody is waiting for.
			Thread.currentThread().interrupt();
			throw new IllegalStateException("Interrupted while backing off from a Gemini failure", cause);
		}
	}

	/**
	 * Turns a response into a result or a message someone can act on.
	 *
	 * <p>The old "returned no candidates" covered four different failures that need four different
	 * responses from whoever reads the log: a blocked prompt needs the prompt changed, an exhausted
	 * token budget needs a config change, and an empty body needs looking at the API. Naming them
	 * costs a few branches and saves the guessing.
	 */
	private GeminiResult interpret(GeminiResponse response, GenerationConfig config) {
		if (response == null) {
			throw new IllegalStateException("Gemini returned an empty body");
		}

		String blockReason =
						response.promptFeedback() == null ? null : response.promptFeedback().blockReason();
		if (blockReason != null) {
			throw new IllegalStateException("Gemini blocked the prompt (blockReason=" + blockReason + ")");
		}

		if (response.candidates() == null || response.candidates().isEmpty()) {
			throw new IllegalStateException("Gemini returned no candidates");
		}

		GeminiResponse.Candidate candidate = response.candidates().get(0);
		String finishReason = candidate.finishReason();
		String text = textOf(candidate);

		if (text == null || text.isBlank()) {
			// A 2.5-series model can spend its whole output budget on reasoning and emit
			// nothing, which arrives as an empty parts array rather than an error.
			if (MAX_TOKENS.equals(finishReason)) {
				throw new IllegalStateException(
								"Gemini produced no output before hitting maxOutputTokens ("
												+ config.maxOutputTokens()
												+ ") — raise it, or lower gemini.json.thinking-budget");
			}
			throw new IllegalStateException("Gemini returned no text (finishReason=" + finishReason + ")");
		}

		// Truncation is survivable for prose and fatal for JSON: half an object will not
		// parse, and failing here names the cause instead of leaving the caller with a
		// Jackson error about an unexpected end of input.
		if (config.expectsJson() && MAX_TOKENS.equals(finishReason)) {
			throw new IllegalStateException(
							"Gemini truncated its JSON at maxOutputTokens ("
											+ config.maxOutputTokens()
											+ ") — the response is incomplete; raise gemini.json.max-output-tokens");
		}

		return GeminiResult.of(text, finishReason, response.usageMetadata());
	}

	/** Concatenates the candidate's parts; long answers can arrive split across several. */
	private static String textOf(GeminiResponse.Candidate candidate) {
		if (candidate.content() == null || candidate.content().parts() == null) {
			return null;
		}
		StringBuilder sb = new StringBuilder();
		for (GeminiResponse.Part part : candidate.content().parts()) {
			if (part.text() != null) {
				sb.append(part.text());
			}
		}
		return sb.toString();
	}
}
