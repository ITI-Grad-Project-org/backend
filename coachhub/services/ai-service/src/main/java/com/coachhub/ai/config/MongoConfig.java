package com.coachhub.ai.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

// TODO: add custom MongoDB configuration if needed
@Configuration
@EnableMongoRepositories(basePackages = "com.coachhub.ai.repository")
public class MongoConfig {
}
