package com.coachhub.ai.service.client;

import com.coachhub.ai.service.client.GeminiProperties.Retry;
import com.coachhub.ai.service.client.GeminiProperties.Sampling;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Covers what generationConfig actually has to get right: that a JSON call carries both the mime
 * type and the schema, that a prose call carries neither, and that the four ways a response can be
 * unusable are told apart by name.
 */
class GeminiClientTest {

	/** Real backoff would make every retry test a two-second wait for nothing. */
	private static final Retry NO_WAIT = new Retry(3, Duration.ofMillis(1), 1.0);

	private static final Map<String, Object> SCHEMA =
					Map.of(
									"type", "OBJECT",
									"properties", Map.of("name", Map.of("type", "STRING")),
									"required", List.of("name"));

	private static final GeminiProperties PROPERTIES =
					new GeminiProperties(
									"https://gemini.test/v1beta",
									"test-key",
									"gemini-2.5-flash",
									null,
									null,
									NO_WAIT,
									new Sampling(0.7, 2048, null),
									new Sampling(0.2, 32768, null));

	private MockRestServiceServer server;
	private GeminiClient client;

	@BeforeEach
	void setUp() {
		RestClient.Builder builder = RestClient.builder();
		server = MockRestServiceServer.bindTo(builder).build();
		client = new GeminiClient(builder, PROPERTIES);
	}

	private void expectCall(String responseBody) {
		server
						.expect(requestTo("https://gemini.test/v1beta/models/gemini-2.5-flash:generateContent"))
						.andExpect(header("x-goog-api-key", "test-key"))
						.andRespond(withSuccess(responseBody, MediaType.APPLICATION_JSON));
	}

	private static String candidate(String text, String finishReason) {
		return """
						{
						  "candidates": [
						    { "content": { "parts": [ { "text": "%s" } ] }, "finishReason": "%s" }
						  ],
						  "usageMetadata": {
						    "promptTokenCount": 120, "candidatesTokenCount": 45,
						    "thoughtsTokenCount": 30, "totalTokenCount": 195
						  }
						}"""
						.formatted(text, finishReason);
	}

	@Test
	@DisplayName("a JSON call sends the mime type, the schema and the json profile's temperature")
	void jsonCallSendsSchema() {
		server
						.expect(requestTo("https://gemini.test/v1beta/models/gemini-2.5-flash:generateContent"))
						.andExpect(jsonPath("$.generationConfig.responseMimeType").value("application/json"))
						.andExpect(jsonPath("$.generationConfig.responseSchema.type").value("OBJECT"))
						.andExpect(jsonPath("$.generationConfig.temperature").value(0.2))
						.andExpect(jsonPath("$.generationConfig.maxOutputTokens").value(32768))
						.andRespond(withSuccess(candidate("{}", "STOP"), MediaType.APPLICATION_JSON));

		client.generateJson("design a week", SCHEMA);

		server.verify();
	}

	@Test
	@DisplayName("a prose call omits the schema entirely rather than sending null")
	void proseCallOmitsSchema() {
		server
						.expect(requestTo("https://gemini.test/v1beta/models/gemini-2.5-flash:generateContent"))
						.andExpect(jsonPath("$.generationConfig.temperature").value(0.7))
						.andExpect(jsonPath("$.generationConfig.maxOutputTokens").value(2048))
						// An explicit null is not the same as an absent key to the API.
						.andExpect(jsonPath("$.generationConfig.responseSchema").doesNotExist())
						.andExpect(jsonPath("$.generationConfig.responseMimeType").doesNotExist())
						.andExpect(jsonPath("$.generationConfig.thinkingConfig").doesNotExist())
						.andRespond(withSuccess(candidate("Sure.", "STOP"), MediaType.APPLICATION_JSON));

		assertThat(client.generate("how much protein?")).isEqualTo("Sure.");

		server.verify();
	}

	@Test
	@DisplayName("thinkingBudget is sent only when configured")
	void thinkingBudgetIsOptIn() {
		GeminiProperties capped =
						new GeminiProperties(
										"https://gemini.test/v1beta",
										"test-key",
										"gemini-2.5-flash",
										null,
										null,
										NO_WAIT,
										new Sampling(0.7, 2048, null),
										new Sampling(0.2, 32768, 0));
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer cappedServer = MockRestServiceServer.bindTo(builder).build();
		cappedServer
						.expect(requestTo("https://gemini.test/v1beta/models/gemini-2.5-flash:generateContent"))
						.andExpect(jsonPath("$.generationConfig.thinkingConfig.thinkingBudget").value(0))
						.andRespond(withSuccess(candidate("{}", "STOP"), MediaType.APPLICATION_JSON));

		new GeminiClient(builder, capped).generateJson("design a week", SCHEMA);

		cappedServer.verify();
	}

	@Test
	@DisplayName("the prompt is still sent as contents")
	void sendsThePrompt() {
		server
						.expect(requestTo("https://gemini.test/v1beta/models/gemini-2.5-flash:generateContent"))
						.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
						.andExpect(jsonPath("$.contents[0].parts[0].text").value("how much protein?"))
						.andRespond(withSuccess(candidate("Sure.", "STOP"), MediaType.APPLICATION_JSON));

		client.generate("how much protein?");

		server.verify();
	}

	@Test
	@DisplayName("token usage is carried back for the caller to record")
	void reportsUsage() {
		expectCall(candidate("{}", "STOP"));

		GeminiResult result = client.generateJson("design a week", SCHEMA);

		assertThat(result.text()).isEqualTo("{}");
		assertThat(result.finishReason()).isEqualTo("STOP");
		assertThat(result.promptTokens()).isEqualTo(120);
		assertThat(result.outputTokens()).isEqualTo(45);
		assertThat(result.thoughtTokens()).isEqualTo(30);
		assertThat(result.totalTokens()).isEqualTo(195);
	}

	@Test
	@DisplayName("truncated JSON fails loudly instead of returning half an object")
	void truncatedJsonThrows() {
		expectCall(candidate("{\\\"name\\\": \\\"half", "MAX_TOKENS"));

		assertThatThrownBy(() -> client.generateJson("design a week", SCHEMA))
						.isInstanceOf(IllegalStateException.class)
						.hasMessageContaining("truncated")
						.hasMessageContaining("32768");
	}

	@Test
	@DisplayName("truncated prose is returned — a short answer still answers")
	void truncatedProseIsKept() {
		expectCall(candidate("Between 1.6 and", "MAX_TOKENS"));

		assertThat(client.generate("how much protein?")).isEqualTo("Between 1.6 and");
	}

	@Test
	@DisplayName("a budget spent entirely on reasoning names the property to raise")
	void emptyOutputAtMaxTokensThrows() {
		expectCall(
						"""
										{ "candidates": [ { "content": { "parts": [] }, "finishReason": "MAX_TOKENS" } ] }""");

		assertThatThrownBy(() -> client.generateJson("design a week", SCHEMA))
						.isInstanceOf(IllegalStateException.class)
						.hasMessageContaining("maxOutputTokens");
	}

	@Test
	@DisplayName("a blocked prompt says so rather than reporting no candidates")
	void blockedPromptThrows() {
		expectCall("""
						{ "promptFeedback": { "blockReason": "SAFETY" } }""");

		assertThatThrownBy(() -> client.generate("something disallowed"))
						.isInstanceOf(IllegalStateException.class)
						.hasMessageContaining("SAFETY");
	}

	@Test
	@DisplayName("multi-part answers are concatenated, not truncated to the first")
	void concatenatesParts() {
		expectCall(
						"""
										{ "candidates": [ { "content": { "parts": [
										  { "text": "Between 1.6 " }, { "text": "and 2.2 g/kg." }
										] }, "finishReason": "STOP" } ] }""");

		assertThat(client.generate("how much protein?")).isEqualTo("Between 1.6 and 2.2 g/kg.");
	}

	// ── Retrying transient failures ───────────────────────────────────────────
	//
	// The listener in ai-service does not requeue a failed plan request, on
	// purpose: a redelivery would publish a second completion for the same
	// suggestion. So if the retry does not happen here it does not happen at all,
	// and a 503 that clears in two seconds costs a coach their whole plan.

	private void expectFailure(org.springframework.http.HttpStatus status) {
		server
						.expect(requestTo("https://gemini.test/v1beta/models/gemini-2.5-flash:generateContent"))
						.andExpect(method(org.springframework.http.HttpMethod.POST))
						.andRespond(withStatus(status));
	}

	@Test
	@DisplayName("a 503 under load is tried again and the second attempt is kept")
	void retriesServiceUnavailable() {
		expectFailure(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE);
		expectCall(candidate("recovered", "STOP"));

		assertThat(client.generate("hello")).isEqualTo("recovered");
		server.verify();
	}

	@Test
	@DisplayName("a 429 over quota is tried again")
	void retriesTooManyRequests() {
		expectFailure(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS);
		expectCall(candidate("recovered", "STOP"));

		assertThat(client.generate("hello")).isEqualTo("recovered");
		server.verify();
	}

	@Test
	@DisplayName("it gives up after the configured number of attempts")
	void stopsAfterMaxAttempts() {
		expectFailure(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE);
		expectFailure(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE);
		expectFailure(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE);

		assertThatThrownBy(() -> client.generate("hello")).hasMessageContaining("503");
		// Exactly three, not four: max-attempts counts the first call.
		server.verify();
	}

	@Test
	@DisplayName("a rejected key is not retried — it would fail identically every time")
	void doesNotRetryForbidden() {
		expectFailure(org.springframework.http.HttpStatus.FORBIDDEN);

		assertThatThrownBy(() -> client.generate("hello")).hasMessageContaining("403");
		// One call only. A leaked key does not un-leak itself on the second attempt.
		server.verify();
	}

	@Test
	@DisplayName("a retired model is not retried")
	void doesNotRetryNotFound() {
		expectFailure(org.springframework.http.HttpStatus.NOT_FOUND);

		assertThatThrownBy(() -> client.generate("hello")).hasMessageContaining("404");
		server.verify();
	}

	@Test
	@DisplayName("a malformed request is not retried")
	void doesNotRetryBadRequest() {
		expectFailure(org.springframework.http.HttpStatus.BAD_REQUEST);

		assertThatThrownBy(() -> client.generate("hello")).hasMessageContaining("400");
		server.verify();
	}

	@Test
	@DisplayName("retrying is off when max-attempts is 1")
	void honoursDisabledRetry() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer once = MockRestServiceServer.bindTo(builder).build();
		GeminiClient noRetry =
						new GeminiClient(
										builder,
										new GeminiProperties(
														"https://gemini.test/v1beta", "test-key", "gemini-2.5-flash", null, null,
														new Retry(1, Duration.ofMillis(1), 1.0),
														new Sampling(0.7, 2048, null), new Sampling(0.2, 32768, null)));
		once.expect(requestTo("https://gemini.test/v1beta/models/gemini-2.5-flash:generateContent"))
						.andRespond(withStatus(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE));

		assertThatThrownBy(() -> noRetry.generate("hello")).hasMessageContaining("503");
		once.verify();
	}
}
