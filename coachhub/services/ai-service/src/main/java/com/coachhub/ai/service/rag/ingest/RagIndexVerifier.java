package com.coachhub.ai.service.rag.ingest;

import com.coachhub.ai.service.rag.RagService;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Asserts that the Atlas vector index can actually filter on the fields retrieval depends on.
 *
 * <h2>Why this needs checking at all</h2>
 *
 * {@code initialize-schema: true} only ever <em>creates</em> the index. Spring AI issues
 * {@code createSearchIndexes} and swallows the {@code IndexAlreadyExists} error, so on any
 * environment whose index already exists — which is every environment that ran an earlier build —
 * adding {@code tenantId} to {@code metadata-fields-to-filter} changes the configuration and
 * nothing else. The index keeps the fields it was born with.
 *
 * <p>That failure is invisible in the worst way. Atlas rejects a {@code $vectorSearch} filtering on
 * an undeclared path, retrieval catches the error and degrades to "no context" exactly as designed,
 * and the assistant carries on answering questions with no knowledge base and no obvious symptom.
 * This is the same shape of bug as an init script that only runs on an empty volume, so it gets the
 * same treatment: check the live object, say plainly what is wrong, and offer to fix it.
 */
@Component
@Order(0) // before any ingest run
public class RagIndexVerifier implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(RagIndexVerifier.class);

	/**
	 * Paths retrieval filters on; every one must be declared as a filter field.
	 *
	 * <p>Adding to this list is not a config change you can simply deploy. Atlas fixes an index's
	 * filter fields when it is CREATED, and Spring AI's {@code initialize-schema} then sees an index
	 * that no longer matches, tries to create one of the same name, and the whole context fails to
	 * start on {@code IndexAlreadyExists} — before this runner ever gets a chance to fix it. Roll the
	 * change out with {@code SPRING_AI_VECTORSTORE_MONGODB_INITIALIZE_SCHEMA=false} and {@code
	 * RAG_REBUILD_INDEX=true} together, so the store leaves the index alone at boot and this drops
	 * and recreates it afterwards.
	 */
	private static final List<String> REQUIRED_FILTER_PATHS =
					List.of(
									"metadata." + RagService.TENANT_KEY,
									"metadata." + RagService.MEMBER_KEY,
									"metadata.source");

	private final MongoTemplate mongoTemplate;
	private final EmbeddingModel embeddingModel;
	private final String collection;
	private final String indexName;
	private final String pathName;
	private final boolean rebuild;

	public RagIndexVerifier(
					MongoTemplate mongoTemplate,
					EmbeddingModel embeddingModel,
					@Value("${spring.ai.vectorstore.mongodb.collection-name}") String collection,
					@Value("${spring.ai.vectorstore.mongodb.index-name}") String indexName,
					@Value("${spring.ai.vectorstore.mongodb.path-name}") String pathName,
					@Value("${coachhub.rag.rebuild-index:false}") boolean rebuild) {
		this.mongoTemplate = mongoTemplate;
		this.embeddingModel = embeddingModel;
		this.collection = collection;
		this.indexName = indexName;
		this.pathName = pathName;
		this.rebuild = rebuild;
	}

	@Override
	public void run(ApplicationArguments args) {
		try {
			verify();
		} catch (Exception ex) {
			// Never block startup on this. It is a diagnostic, and a service that
			// refuses to boot because it could not introspect an index is worse than
			// one that boots and says so.
			log.warn("could not verify the Atlas vector index: {}", ex.getMessage());
		}
	}

	private void verify() {
		Document index = findIndex();
		if (index == null) {
			// Nothing to reconcile — the store's own initialize-schema will have created
			// it from the current config, filter fields included.
			log.info("vector index '{}' not reported yet; assuming initialize-schema created it", indexName);
			return;
		}

		List<String> missing = missingFilterPaths(index);
		if (missing.isEmpty()) {
			// The collection is named explicitly because it is the difference between
			// a local run and one that writes into the production knowledge base, and
			// that is not otherwise visible anywhere in the logs.
			log.info(
							"knowledge base: collection '{}', index '{}' filtering on {} — tenant isolation active",
							collection,
							indexName,
							REQUIRED_FILTER_PATHS);
			return;
		}

		if (rebuild) {
			log.warn("vector index '{}' is missing {} — rebuilding", indexName, missing);
			rebuild();
			return;
		}

		log.error(
						"""
										Vector index '{}' cannot filter on {}.
										Retrieval filters by tenant, so every query will fail and the assistant will \
										answer with NO knowledge base at all.
										The index was created before these filter fields were configured and Atlas \
										will not add them to an existing index.
										Fix: restart once with RAG_REBUILD_INDEX=true, or drop the index by hand:
										  db.{}.dropSearchIndex("{}")""",
						indexName,
						missing,
						collection,
						indexName);
	}

	private Document findIndex() {
		List<Document> indexes = new ArrayList<>();
		mongoTemplate
						.getCollection(collection)
						.aggregate(List.of(new Document("$listSearchIndexes", new Document())))
						.into(indexes);
		return indexes.stream()
		              .filter(doc -> indexName.equals(doc.getString("name")))
		              .findFirst()
		              .orElse(null);
	}

	/**
	 * Atlas reports the definition under {@code latestDefinition}, which is the one that will be
	 * used once any in-progress build finishes.
	 */
	@SuppressWarnings("unchecked")
	static List<String> declaredFilterPaths(Document index) {
		Document definition = index.get("latestDefinition", Document.class);
		if (definition == null) {
			return List.of();
		}
		List<Document> fields = (List<Document>) definition.get("fields");
		if (fields == null) {
			return List.of();
		}
		return fields.stream()
		             .filter(f -> "filter".equals(f.getString("type")))
		             .map(f -> f.getString("path"))
		             .filter(java.util.Objects::nonNull)
		             .toList();
	}

	private static List<String> missingFilterPaths(Document index) {
		List<String> declared = declaredFilterPaths(index);
		return REQUIRED_FILTER_PATHS.stream().filter(p -> !declared.contains(p)).toList();
	}

	/**
	 * Drops and recreates the index. The documents survive — only the index is rebuilt — but
	 * searches return nothing until Atlas finishes reindexing, which is why this is opt-in rather
	 * than automatic.
	 */
	private void rebuild() {
		mongoTemplate.executeCommand(
						new Document("dropSearchIndex", collection).append("name", indexName));

		List<Document> fields = new ArrayList<>();
		fields.add(
						new Document("type", "vector")
										.append("path", pathName)
										// Taken from the model rather than written down, for the same reason
										// Spring AI does it: a hardcoded 768 against a 3072-d model fails at
										// query time, not at startup.
										.append("numDimensions", embeddingModel.dimensions())
										.append("similarity", "cosine"));
		REQUIRED_FILTER_PATHS.forEach(
						path -> fields.add(new Document("type", "filter").append("path", path)));

		mongoTemplate.executeCommand(
						new Document("createSearchIndexes", collection)
										.append(
														"indexes",
														List.of(
																		new Document("name", indexName)
																						.append("type", "vectorSearch")
																						.append(
																										"definition",
																										new Document("fields", fields)))));
		log.warn(
						"vector index '{}' rebuilt with filters {} — searches return nothing until Atlas finishes reindexing",
						indexName,
						REQUIRED_FILTER_PATHS);
	}
}
