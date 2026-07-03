package com.coachhub.ai.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

// TODO: add custom MongoDB configuration if needed.
// Base package must cover where the repositories actually live
// (AiRequestRepository is in com.coachhub.ai.domain).
@Configuration
@EnableMongoRepositories(basePackages = "com.coachhub.ai")
public class MongoConfig {
}
