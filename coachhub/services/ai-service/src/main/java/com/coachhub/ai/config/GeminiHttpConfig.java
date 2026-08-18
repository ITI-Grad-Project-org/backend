package com.coachhub.ai.config;

import com.coachhub.ai.service.client.GeminiProperties;
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.http.client.ClientHttpRequestFactorySettings;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Puts timeouts on the outbound Gemini calls.
 *
 * <h2>Why this exists at all</h2>
 *
 * <p>The JDK's default is to wait forever. That was survivable while the only call was a chat
 * question; it is not now. A plan generation holds a RabbitMQ consumer for its entire duration, so
 * one connection that never answers stops {@code ai.plan.q} permanently — and leaves nothing in the
 * log to say why, because nothing failed.
 *
 * <h2>Why a customizer and not the client's constructor</h2>
 *
 * <p>A request factory set inside {@code GeminiClient} would overwrite whatever the caller had
 * already put on the builder. That is not hypothetical: it is exactly how {@code
 * MockRestServiceServer} works, so doing it there turns every client test into a real network call.
 * Spring Boot applies customizers to the auto-configured builder only, which is the one production
 * uses and the one tests deliberately bypass.
 */
@Configuration
public class GeminiHttpConfig {

	@Bean
	RestClientCustomizer geminiTimeouts(GeminiProperties properties) {
		return builder ->
						builder.requestFactory(
										ClientHttpRequestFactoryBuilder.detect()
														.build(ClientHttpRequestFactorySettings.defaults()
																		.withConnectTimeout(properties.connectTimeout())
																		.withReadTimeout(properties.readTimeout())));
	}
}
