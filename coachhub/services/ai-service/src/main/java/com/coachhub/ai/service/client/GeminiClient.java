package com.coachhub.ai.service.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class GeminiClient {
	private final RestClient restClient;
	private final String apiKey;
	private final String model;

	public GeminiClient(
					RestClient.Builder builder,
					@Value("${gemini.base-url}") String baseUrl,
					@Value("${gemini.api-key}") String apiKey,
					@Value("${gemini.model}") String model) {
		this.restClient = builder.baseUrl(baseUrl).build();
		this.apiKey = apiKey;
		this.model = model;
	}

	public String generate(String prompt) {
		GeminiDtos.GeminiResponse response = restClient.post()
		                                               .uri("/models/{model}:generateContent", model)
		                                               .header("x-goog-api-key", apiKey)
		                                               .contentType(MediaType.APPLICATION_JSON)
		                                               .body(GeminiDtos.GeminiRequest.of(prompt))
		                                               .retrieve()
		                                               .body(GeminiDtos.GeminiResponse.class);

		if (response == null
						|| response.candidates() == null
						|| response.candidates().isEmpty()
						|| response.candidates().get(0).content() == null
						|| response.candidates().get(0).content().parts() == null
						|| response.candidates().get(0).content().parts().isEmpty()) {
			throw new IllegalStateException("Gemini returned no candidates");
		}
		return response.candidates().get(0).content().parts().get(0).text();
	}
}
