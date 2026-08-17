package com.coachhub.ai;

import com.coachhub.ai.service.client.GeminiProperties;
import com.coachhub.ai.service.rag.RagProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties({RagProperties.class, GeminiProperties.class})
public class AiServiceApplication {
	public static void main(String[] args) {
		SpringApplication.run(AiServiceApplication.class, args);
	}
}
