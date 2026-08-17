package com.coachhub.ai.service.rag.ingest;

import com.coachhub.ai.service.rag.RagService;

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
				String id,
				String tenantId,
				String membershipId,
				String source,
				String origin,
				String text) {

	public static final String ORIGIN_CORE_DB = "core-db";
	public static final String ORIGIN_CURATED = "curated";

	public KnowledgeDocument {
		membershipId = (membershipId == null || membershipId.isBlank())
						? RagService.NO_MEMBER
						: membershipId;
	}

	/** Knowledge that belongs to a tenant but not to any one client. */
	public static KnowledgeDocument of(
					String tenantId, String source, String origin, String text) {
		return of(tenantId, RagService.NO_MEMBER, source, origin, text);
	}

	/** Knowledge about one client — a check-in, a note, anything they wrote. */
	public static KnowledgeDocument of(
					String tenantId, String membershipId, String source, String origin, String text) {
		return new KnowledgeDocument(
						contentId(tenantId, membershipId, source, text),
						tenantId,
						membershipId,
						source,
						origin,
						text);
	}

	/**
	 * The id is a hash of everything that identifies the chunk, which makes the diff free — but it
	 * also means CHANGING WHAT GOES INTO IT re-ids the entire corpus. Every existing document becomes
	 * unreachable and every new one is an addition, which the prune brake in {@link
	 * KnowledgeIngestService} will correctly refuse to clean up because it looks like the collection
	 * turning over. Adding an input here is a one-off "empty the collection and re-ingest", not a
	 * deploy.
	 *
	 * <p>Tenant is part of the hash on purpose. The exercise libraries are copied per tenant from the
	 * same 100 defaults, so the same text genuinely does exist under many tenants — hashing text
	 * alone would collapse them into one document and leak it across every coach.
	 */
	private static String contentId(
					String tenantId, String membershipId, String source, String text) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			digest.update(tenantId.getBytes(StandardCharsets.UTF_8));
			digest.update((byte) 0);
			// The member joins the hash for the same reason the tenant does: two clients
			// of the same coach can write the same sentence, and collapsing those into
			// one document would show one client's words under the other's name.
			digest.update(
							(membershipId == null ? RagService.NO_MEMBER : membershipId)
											.getBytes(StandardCharsets.UTF_8));
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
