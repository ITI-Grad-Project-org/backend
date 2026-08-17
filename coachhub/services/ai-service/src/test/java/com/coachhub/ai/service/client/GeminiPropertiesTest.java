package com.coachhub.ai.service.client;

import com.coachhub.ai.service.client.GeminiProperties.Sampling;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The defaulting is the whole point of the record: YAML binding hands over nulls for anything the
 * operator did not set, and a null temperature reaching the request body means the profile silently
 * stopped applying.
 */
class GeminiPropertiesTest {

	private static GeminiProperties with(Sampling chat, Sampling json) {
		return new GeminiProperties(null, "key", null, null, null, null, chat, json);
	}

	@Test
	@DisplayName("unset profiles fall back to the prose and JSON defaults")
	void appliesProfileDefaults() {
		GeminiProperties properties = with(null, null);

		assertThat(properties.chat().temperature()).isEqualTo(0.7);
		assertThat(properties.chat().maxOutputTokens()).isEqualTo(2048);
		assertThat(properties.json().temperature()).isEqualTo(0.2);
		assertThat(properties.json().maxOutputTokens()).isEqualTo(32768);
	}

	@Test
	@DisplayName("setting one field does not blank the others")
	void fillsGapsRatherThanReplacing() {
		// The failure this guards: `gemini.json.temperature: 0.1` in YAML binds a
		// Sampling with a null maxOutputTokens, and a wholesale default would have
		// thrown the operator's value away instead.
		GeminiProperties properties = with(null, new Sampling(0.1, null, null));

		assertThat(properties.json().temperature()).isEqualTo(0.1);
		assertThat(properties.json().maxOutputTokens()).isEqualTo(32768);
	}

	@Test
	@DisplayName("thinkingBudget stays null so the model picks its own")
	void thinkingBudgetIsNotDefaulted() {
		assertThat(with(null, null).json().thinkingBudget()).isNull();
		assertThat(with(null, new Sampling(null, null, 0)).json().thinkingBudget()).isZero();
	}

	@Test
	@DisplayName("base URL and model fall back when the environment supplies neither")
	void appliesConnectionDefaults() {
		GeminiProperties properties = with(null, null);

		assertThat(properties.baseUrl()).isEqualTo("https://generativelanguage.googleapis.com/v1beta");
		assertThat(properties.model()).isEqualTo("gemini-2.5-flash");
	}

	@Test
	@DisplayName("a nonsensical token budget is replaced, not passed on")
	void rejectsNonPositiveTokenBudget() {
		GeminiProperties properties = with(null, new Sampling(0.2, 0, null));

		assertThat(properties.json().maxOutputTokens()).isEqualTo(32768);
	}

	@Test
	@DisplayName("timeouts always have a value — waiting forever holds a queue consumer for good")
	void neverLeavesTimeoutsUnset() {
		GeminiProperties unset = with(null, null);

		assertThat(unset.connectTimeout()).isEqualTo(Duration.ofSeconds(10));
		assertThat(unset.readTimeout()).isEqualTo(Duration.ofMinutes(3));
	}

	@Test
	@DisplayName("a zero timeout means 'wait forever' to the JDK, so it is treated as unset")
	void rejectsInfiniteTimeouts() {
		GeminiProperties zeroed =
						new GeminiProperties(null, "key", null, Duration.ZERO, Duration.ofSeconds(-1), null, null, null);

		assertThat(zeroed.connectTimeout()).isEqualTo(Duration.ofSeconds(10));
		assertThat(zeroed.readTimeout()).isEqualTo(Duration.ofMinutes(3));
	}

	@Test
	@DisplayName("a configured timeout is kept")
	void keepsConfiguredTimeouts() {
		GeminiProperties configured =
						new GeminiProperties(
										null, "key", null, Duration.ofSeconds(5), Duration.ofMinutes(10), null, null, null);

		assertThat(configured.connectTimeout()).isEqualTo(Duration.ofSeconds(5));
		assertThat(configured.readTimeout()).isEqualTo(Duration.ofMinutes(10));
	}
}
