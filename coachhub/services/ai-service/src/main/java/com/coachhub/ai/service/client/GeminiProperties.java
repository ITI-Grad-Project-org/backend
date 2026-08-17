package com.coachhub.ai.service.client;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Connection and sampling settings for the Gemini generateContent call.
 *
 * <p>Two sampling profiles, because the two things we ask the model for want opposite settings.
 * Coaching advice is prose: a little warmth reads better and the answer is short. A plan is a
 * document with a schema: creativity there shows up as invented fields and near-duplicate
 * exercises, and the output is an order of magnitude longer. Hard-coding one set of numbers would
 * mean picking which of the two to serve badly.
 */
@ConfigurationProperties(prefix = "gemini")
public record GeminiProperties(
				String baseUrl,
				String apiKey,
				String model,
				Duration connectTimeout,
				Duration readTimeout,
				Retry retry,
				Sampling chat,
				Sampling json) {

	private static final String DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
	private static final String DEFAULT_MODEL = "gemini-2.5-flash";
	private static final Duration DEFAULT_CONNECT_TIMEOUT = Duration.ofSeconds(10);

	/**
	 * Generous, because designing a whole week takes the model a while and cutting it off at 30
	 * seconds would fail requests that were going to succeed. But not unbounded: a plan generation
	 * holds a RabbitMQ consumer for as long as it runs, and without this a single hung connection
	 * stops the queue for good.
	 */
	private static final Duration DEFAULT_READ_TIMEOUT = Duration.ofMinutes(3);

	public GeminiProperties {
		if (baseUrl == null || baseUrl.isBlank()) {
			baseUrl = DEFAULT_BASE_URL;
		}
		if (model == null || model.isBlank()) {
			model = DEFAULT_MODEL;
		}
		connectTimeout = positiveOr(connectTimeout, DEFAULT_CONNECT_TIMEOUT);
		readTimeout = positiveOr(readTimeout, DEFAULT_READ_TIMEOUT);
		retry = Retry.withDefaults(retry);
		// Prose: enough headroom for a long answer, warm enough not to read like a manual.
		chat = Sampling.withDefaults(chat, 0.7, 2048);
		// JSON: near-deterministic, and a budget sized for a full week of programming.
		// Raise max-output-tokens before blaming the model for truncated plans — the
		// client reports finishReason=MAX_TOKENS by name when that is what happened.
		json = Sampling.withDefaults(json, 0.2, 32768);
	}

	/**
	 * How hard to try again when Gemini says "not now".
	 *
	 * <p>The model returns 503 under load — "spikes in demand are usually temporary" — and 429 when
	 * the key is over quota for the minute. Both clear on their own in seconds. Without a retry a
	 * momentary spike costs a coach their whole request: the listener does not requeue, deliberately,
	 * because a redelivery would publish a second completion for the same suggestion.
	 *
	 * @param maxAttempts total attempts including the first, so 1 disables retrying.
	 * @param initialBackoff wait before the second attempt; each further wait multiplies by {@code
	 *     multiplier}.
	 */
	public record Retry(Integer maxAttempts, Duration initialBackoff, Double multiplier) {

		private static final int DEFAULT_MAX_ATTEMPTS = 3;
		private static final Duration DEFAULT_INITIAL_BACKOFF = Duration.ofSeconds(2);
		private static final double DEFAULT_MULTIPLIER = 2.0;

		static Retry withDefaults(Retry configured) {
			if (configured == null) {
				return new Retry(DEFAULT_MAX_ATTEMPTS, DEFAULT_INITIAL_BACKOFF, DEFAULT_MULTIPLIER);
			}
			return new Retry(
							configured.maxAttempts() == null || configured.maxAttempts() < 1
											? DEFAULT_MAX_ATTEMPTS
											: configured.maxAttempts(),
							positiveOr(configured.initialBackoff(), DEFAULT_INITIAL_BACKOFF),
							configured.multiplier() == null || configured.multiplier() < 1.0
											? DEFAULT_MULTIPLIER
											: configured.multiplier());
		}

		/** Wait before attempt {@code n}, where the first retry is n = 2. */
		Duration backoffBefore(int attempt) {
			double millis = initialBackoff.toMillis() * Math.pow(multiplier, attempt - 2);
			return Duration.ofMillis((long) millis);
		}
	}

	/** Zero and negative are treated as unset — an infinite timeout is never what was meant. */
	private static Duration positiveOr(Duration configured, Duration fallback) {
		return configured == null || configured.isZero() || configured.isNegative()
						? fallback
						: configured;
	}

	/** Per-profile sampling. Any field left unset falls back to the profile's default. */
	public record Sampling(Double temperature, Integer maxOutputTokens, Integer thinkingBudget) {

		/**
		 * Fills the gaps rather than replacing wholesale, so setting one property in YAML does not
		 * silently reset the others to null.
		 *
		 * @param thinkingBudget is deliberately left null when unset — omitting {@code
		 *     thinkingConfig} lets the model choose, which is the documented default and a better
		 *     one than any number we would invent here.
		 */
		static Sampling withDefaults(Sampling configured, double temperature, int maxOutputTokens) {
			if (configured == null) {
				return new Sampling(temperature, maxOutputTokens, null);
			}
			return new Sampling(
							configured.temperature() == null ? temperature : configured.temperature(),
							configured.maxOutputTokens() == null || configured.maxOutputTokens() <= 0
											? maxOutputTokens
											: configured.maxOutputTokens(),
							configured.thinkingBudget());
		}
	}
}
