package com.coachhub.ai.service.rag.ingest;

import com.coachhub.ai.service.rag.RagProperties;
import com.coachhub.ai.service.rag.RagService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Keeps the vector store in step with core_db and the curated corpus.
 *
 * <h2>Why this is a diff and not a re-seed</h2>
 *
 * Embedding is the expensive part — one Gemini call per batch, several hundred documents on a cold
 * store. Re-embedding everything on a schedule would burn quota to produce vectors identical to the
 * ones already there. Because ids are content hashes ({@link KnowledgeDocument}), "has this chunk
 * changed" is answerable with a single {@code _id} query against Mongo, so a run where nothing
 * changed in core_db costs one cheap read and zero embedding calls.
 *
 * <p>The same property makes deletions work. An exercise that was renamed leaves its old id in the
 * store with nothing generating it any more; anything in the store that this run did not produce is
 * stale by definition and gets pruned. That is what stops the corpus from slowly filling with
 * material a coach has already deleted from their library.
 */
@Service
@ConditionalOnProperty(name = "coachhub.rag.ingest.enabled", havingValue = "true", matchIfMissing = true)
public class KnowledgeIngestService {

	private static final Logger log = LoggerFactory.getLogger(KnowledgeIngestService.class);

	private final VectorStore vectorStore;
	private final MongoTemplate mongoTemplate;
	private final CoreDbKnowledgeReader coreDb;
	private final CuratedKnowledgeReader curated;
	private final RagProperties properties;
	private final String collection;

	/**
	 * Refreshes are scheduled, so a slow run and the next trigger can overlap. Two concurrent syncs
	 * would each see the other's half-written state and prune documents the other had just added.
	 */
	private final AtomicBoolean running = new AtomicBoolean(false);

	public KnowledgeIngestService(
					VectorStore vectorStore,
					MongoTemplate mongoTemplate,
					CoreDbKnowledgeReader coreDb,
					CuratedKnowledgeReader curated,
					RagProperties properties,
					@Value("${spring.ai.vectorstore.mongodb.collection-name}") String collection) {
		this.vectorStore = vectorStore;
		this.mongoTemplate = mongoTemplate;
		this.coreDb = coreDb;
		this.curated = curated;
		this.properties = properties;
		this.collection = collection;
	}

	/**
	 * Runs shortly after boot and then on a fixed interval.
	 *
	 * <p>Deliberately not an {@code ApplicationRunner}: a cold first sync embeds the whole library
	 * and would hold up startup past the readiness probe. On the scheduler it runs on its own
	 * thread, the pod reports ready immediately, and retrieval serves whatever is already in Atlas
	 * while the refresh catches up.
	 */
	@Scheduled(
					initialDelayString = "${coachhub.rag.ingest.initial-delay:30s}",
					fixedDelayString = "${coachhub.rag.ingest.interval:30m}")
	public void scheduledSync() {
		try {
			sync();
		} catch (Exception ex) {
			// A refresh failure must never kill the scheduler thread — that would
			// silently stop every future refresh, and the store would quietly go stale
			// with no further signal.
			log.error("knowledge-base sync failed: {}", ex.getMessage(), ex);
		}
	}

	/**
	 * @return what changed, for logging and tests
	 */
	public SyncResult sync() {
		if (!running.compareAndSet(false, true)) {
			log.info("knowledge-base sync already in progress — skipping this trigger");
			return SyncResult.skipped();
		}
		try {
			return doSync();
		} finally {
			running.set(false);
		}
	}

	private SyncResult doSync() {
		long startedAt = System.currentTimeMillis();

		// Curated first: it is local and cannot fail on a network, so an unreachable
		// core_db still leaves the assistant with its coaching knowledge.
		List<KnowledgeDocument> desired = new ArrayList<>(curated.readAll());
		int curatedCount = desired.size();
		desired.addAll(coreDb.readAll());

		// Two rows can render to identical text under the same tenant and source —
		// duplicate exercise names in a library, say. They hash to one id, and adding
		// the same id twice in one batch makes Spring AI's doAdd mis-pair embeddings
		// (it resolves each document's vector with indexOf). Collapse first.
		Map<String, KnowledgeDocument> byId = new LinkedHashMap<>();
		for (KnowledgeDocument doc : desired) {
			byId.putIfAbsent(doc.id(), doc);
		}

		Set<String> existing = existingIds();
		Set<String> wanted = byId.keySet();

		List<KnowledgeDocument> toAdd =
						byId.values().stream().filter(d -> !existing.contains(d.id())).toList();
		List<String> toRemove = existing.stream().filter(id -> !wanted.contains(id)).toList();

		// Add before prune, so there is never a window with no knowledge base.
		int added = add(toAdd);
		int removed = isPruneSafe(toRemove.size(), existing.size()) ? remove(toRemove) : 0;

		SyncResult result =
						new SyncResult(
										byId.size(),
										curatedCount,
										byId.size() - curatedCount,
										added,
										removed,
										System.currentTimeMillis() - startedAt);
		log.info(
						"knowledge base synced: {} chunks ({} curated, {} from core_db) — {} added, {} pruned in {} ms",
						result.total(),
						result.curated(),
						result.fromCoreDb(),
						result.added(),
						result.removed(),
						result.tookMs());
		return result;
	}

	/**
	 * Refuses a prune that would remove most of the collection.
	 *
	 * <p>A run wanting to delete nearly everything is reporting a fault, not a change — core_db
	 * unreachable, a rendering tweak that rewrote every id at once, or the service pointed at the
	 * wrong database. Deleting on that signal turns a recoverable misconfiguration into a wiped
	 * knowledge base that has to be re-embedded from scratch.
	 *
	 * <p>Small collections are exempt: during development a corpus of a dozen chunks legitimately
	 * turns over completely, and tripping there would only teach people to disable the guard.
	 */
	private boolean isPruneSafe(int toRemove, int existing) {
		double ratio = properties.ingest().maxPruneRatio();
		if (toRemove == 0 || existing < PRUNE_GUARD_MIN_CORPUS) {
			return true;
		}
		if ((double) toRemove / existing <= ratio) {
			return true;
		}
		log.error(
						"REFUSING to prune {} of {} chunks ({}% > {}% limit) — this looks like a fault, "
										+ "not a change. Check core_db is reachable and that this service points at "
										+ "the intended collection. Additions were still applied. Raise "
										+ "coachhub.rag.ingest.max-prune-ratio if the turnover really is intended.",
						toRemove,
						existing,
						Math.round(100.0 * toRemove / existing),
						Math.round(100.0 * ratio));
		return false;
	}

	/** Below this many chunks a full turnover is normal (a dev database, a first run). */
	private static final int PRUNE_GUARD_MIN_CORPUS = 20;

	/** Just the {@code _id}s — the vectors are large and none of this needs them. */
	private Set<String> existingIds() {
		Query query = new Query();
		query.fields().include("_id");
		return mongoTemplate.find(query, org.bson.Document.class, collection).stream()
		                    .map(doc -> doc.get("_id"))
		                    .filter(java.util.Objects::nonNull)
		                    .map(String::valueOf)
		                    .collect(java.util.stream.Collectors.toCollection(HashSet::new));
	}

	private int add(List<KnowledgeDocument> docs) {
		if (docs.isEmpty()) {
			return 0;
		}
		int batchSize = properties.ingest().batchSize();
		int added = 0;
		for (int from = 0; from < docs.size(); from += batchSize) {
			List<KnowledgeDocument> batch = docs.subList(from, Math.min(from + batchSize, docs.size()));
			try {
				vectorStore.add(batch.stream().map(KnowledgeIngestService::toSpringAiDocument).toList());
				added += batch.size();
			} catch (Exception ex) {
				// One rejected batch (a rate limit, one oversized chunk) should cost that
				// batch, not the other several hundred documents. What is missed here is
				// picked up on the next scheduled run, because its ids are still absent.
				log.warn(
								"embedding batch {}-{} failed, continuing: {}",
								from,
								from + batch.size(),
								ex.getMessage());
			}
		}
		return added;
	}

	private int remove(List<String> ids) {
		if (ids.isEmpty()) {
			return 0;
		}
		try {
			vectorStore.delete(ids);
			return ids.size();
		} catch (Exception ex) {
			log.warn("pruning {} stale chunks failed: {}", ids.size(), ex.getMessage());
			return 0;
		}
	}

	private static Document toSpringAiDocument(KnowledgeDocument doc) {
		Map<String, Object> metadata = new HashMap<>();
		metadata.put(RagService.TENANT_KEY, doc.tenantId());
		metadata.put("source", doc.source());
		metadata.put("origin", doc.origin());
		// Explicit id, not the generated default — this is the whole basis of the
		// diff, and Document.Builder would otherwise hand out a random UUID.
		return Document.builder().id(doc.id()).text(doc.text()).metadata(metadata).build();
	}

	/**
	 * @param total      chunks the sources produced this run
	 * @param curated    of which came from {@code resources/kb}
	 * @param fromCoreDb of which came from core_db
	 * @param added      newly embedded
	 * @param removed    pruned as stale
	 * @param tookMs     wall-clock duration
	 */
	public record SyncResult(
					int total, int curated, int fromCoreDb, int added, int removed, long tookMs) {

		static SyncResult skipped() {
			return new SyncResult(0, 0, 0, 0, 0, 0);
		}
	}
}
