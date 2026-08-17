package com.coachhub.ai.service.rag;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.Filter;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class SpringAiRagService implements RagService {

	private static final Logger log = LoggerFactory.getLogger(SpringAiRagService.class);

	private final VectorStore vectorStore;
	private final RagProperties properties;

	public SpringAiRagService(VectorStore vectorStore, RagProperties properties) {
		this.vectorStore = vectorStore;
		this.properties = properties;
	}

	@Override
	public List<RagChunk> retrieve(String query, String tenantId, String membershipId, int topK) {

		List<Object> scopes =
						(tenantId == null || tenantId.isBlank())
										? List.of(GLOBAL_TENANT)
										: List.of(tenantId, GLOBAL_TENANT);

		SearchRequest request =
						SearchRequest.builder()
						             .query(query)
						             .topK(topK)
						             // Without this the request uses Spring AI's accept-all
						             // default of 0.0 and Atlas matches on `score >= 0`, so a
						             // query about billing is grounded with squat cues purely
						             // because they were the least-bad of a short list.
						             .similarityThreshold(properties.similarityThreshold())
						             // Two scopes, both closed lists. The member filter is what keeps
						             // one client's check-ins away from another client of the same
						             // coach: without it a tenant-only filter would happily return
						             // them, because they are in the same tenant by definition.
						             .filterExpression(buildFilter(scopes, membershipId))
						             .build();

		List<Document> results = vectorStore.similaritySearch(request);
		if (results == null || results.isEmpty()) {
			log.debug("no chunks above {} for tenant {}", properties.similarityThreshold(), tenantId);
			return List.of();
		}

		List<RagChunk> chunks =
						results.stream()
						       .map(
										       doc ->
														       new RagChunk(
																		       doc.getText(),
																		       String.valueOf(
																						       doc.getMetadata()
																						          .getOrDefault("source", "kb")),
																		       doc.getScore() == null
																						       ? 0.0
																						       : doc.getScore()))
						       .toList();

		if (log.isDebugEnabled()) {
			log.debug(
							"retrieved {} chunks for tenant {}: {}",
							chunks.size(),
							tenantId,
							chunks.stream()
							      .map(c -> "%s=%.3f".formatted(c.source(), c.score()))
							      .toList());
		}
		return chunks;
	}

	/**
	 * Tenant AND member, both as membership tests against a closed list.
	 *
	 * With no member the search sees only material tied to nobody in particular — the exercise
	 * library, the curated corpus. Asking about a client without naming one should not quietly
	 * return whichever client happened to score highest.
	 */
	private static Filter.Expression buildFilter(List<Object> scopes, String membershipId) {
		FilterExpressionBuilder builder = new FilterExpressionBuilder();
		List<Object> members =
						(membershipId == null || membershipId.isBlank())
										? List.of(NO_MEMBER)
										: List.of(membershipId, NO_MEMBER);
		return builder.and(builder.in(TENANT_KEY, scopes), builder.in(MEMBER_KEY, members)).build();
	}
}
