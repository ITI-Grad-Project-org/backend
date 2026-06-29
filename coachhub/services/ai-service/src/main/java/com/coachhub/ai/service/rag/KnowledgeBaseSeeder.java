package com.coachhub.ai.service.rag;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

// Seeds the RAG knowledge base at startup. Disable with
// coachhub.rag.seed-on-startup=false (e.g. in tests, or when no Gemini key).
@Component
@ConditionalOnProperty(name = "coachhub.rag.seed-on-startup", havingValue = "true", matchIfMissing = true)
public class KnowledgeBaseSeeder implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(KnowledgeBaseSeeder.class);

	private final VectorStore vectorStore;
	private final MongoTemplate mongoTemplate;
	private final String collection;

	public KnowledgeBaseSeeder(VectorStore vectorStore,
	                           MongoTemplate mongoTemplate,
	                           @Value("${spring.ai.vectorstore.mongodb.collection-name}") String collection) {
		this.vectorStore = vectorStore;
		this.mongoTemplate = mongoTemplate;
		this.collection = collection;
	}

	@Override
	public void run(ApplicationArguments args) {
		List<Document> docs = List.of(
						Document.builder()
						        .text("Progressive overload: gradually increase weight, reps, or total volume so muscles keep " +
										        "adapting. Small weekly increments are sustainable for most clients.")
						        .metadata(Map.of("source", "training-principles"))
						        .build(),
						Document.builder()
						        .text("Protein for muscle gain is typically 1.6 to 2.2 g per kg of bodyweight per day, spread " +
										        "across 3 to 5 meals.")
						        .metadata(Map.of("source", "nutrition-basics"))
						        .build(),
						Document.builder()
						        .text("Deload weeks every 4 to 8 weeks cut volume and intensity by roughly 40 to 60 percent to " +
										        "aid" +
										        " recovery and prevent overtraining.")
						        .metadata(Map.of("source", "programming"))
						        .build(),
						Document.builder()
						        .text("A beginner push/pull/legs split trains each movement pattern about once per week. Three " +
										        "sessions suit new lifters building base strength before adding frequency.")
						        .metadata(Map.of("source", "program-templates"))
						        .build());

		// Embedding hits the Gemini API. Never let a bad key / network blip crash
		// startup — log and carry on (RAG simply returns no context until fixed).
		try {
			// The store is now persistent (Atlas), so only seed once — re-adding
			// every boot would duplicate every chunk.
			long existing = mongoTemplate.getCollection(collection).estimatedDocumentCount();
			if (existing > 0) {
				log.info("knowledge base already has {} docs in '{}' — skipping seed", existing, collection);
				return;
			}
			vectorStore.add(docs);
			log.info("seeded {} knowledge-base docs into '{}'", docs.size(), collection);
		} catch (Exception ex) {
			log.warn("knowledge-base seeding failed; RAG will run without context: {}", ex.getMessage());
		}
	}
}
