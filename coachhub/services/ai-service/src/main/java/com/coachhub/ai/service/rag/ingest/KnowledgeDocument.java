package com.coachhub.ai.service.rag.ingest;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * One chunk on its way into the vector store, before it has been embedded.
 *
 * <p>The id is derived from the content rather than generated, which is what makes the whole
 * ingest loop re-runnable. Spring AI's default {@code RandomIdGenerator} hands out a fresh UUID
 * every boot, so re-adding the same material produces duplicates instead of updates — the reason
 * the previous seeder could only ever run once, against an empty collection, and why editing a
 * seeded document had no effect. With a content hash for an id, an unchanged row keeps its id and
 * is skipped, an edited row gets a new id and is added, and the id it used to have is left
 * dangling where {@link KnowledgeIngestService} can prune it.
 *
 * @param id       SHA-256 of tenant + source + text
 * @param tenantId owning tenant, or {@code RagService.GLOBAL_TENANT} for curated material
 * @param source   which body of knowledge this came from, e.g. {@code exercise-library}
 * @param origin   {@code core-db} or {@code curated} — the unit of pruning
 * @param text     the chunk as the embedding model will see it
 */
public record KnowledgeDocument(
				String id, String tenantId, String source, String origin, String text) {

	public static final String ORIGIN_CORE_DB = "core-db";
	public static final String ORIGIN_CURATED = "curated";

	public static KnowledgeDocument of(
					String tenantId, String source, String origin, String text) {
		return new KnowledgeDocument(contentId(tenantId, source, text), tenantId, source, origin, text);
	}

	/**
	 * Tenant is part of the hash on purpose. The exercise libraries are copied per tenant from the
	 * same 100 defaults, so the same text genuinely does exist under many tenants — hashing text
	 * alone would collapse them into one document and leak it across every coach.
	 */
	private static String contentId(String tenantId, String source, String text) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			digest.update(tenantId.getBytes(StandardCharsets.UTF_8));
			digest.update((byte) 0);
			digest.update(source.getBytes(StandardCharsets.UTF_8));
			digest.update((byte) 0);
			digest.update(text.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest.digest());
		} catch (NoSuchAlgorithmException ex) {
			// SHA-256 is required of every JVM; if it is genuinely absent the process
			// is not one we can ingest into.
			throw new IllegalStateException("SHA-256 unavailable", ex);
		}
	}
}
