package com.coachhub.ai.domain;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface AiRequestRepository extends MongoRepository<AiDocument, String> {
	Optional<AiDocument> findByRequestId(String requestId);
}
