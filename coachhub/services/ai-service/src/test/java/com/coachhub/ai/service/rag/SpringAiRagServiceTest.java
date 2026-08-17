package com.coachhub.ai.service.rag;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.Filter;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Guards the two properties that make retrieval safe rather than merely functional: a threshold is
 * always applied, and a search is always scoped to one tenant plus the shared corpus.
 *
 * <p>Neither is visible in the response, so nothing else would catch them regressing — a missing
 * filter returns plausible chunks belonging to somebody else, and a missing threshold returns
 * plausible chunks that match nothing.
 */
class SpringAiRagServiceTest {

	private static final RagProperties PROPS =
					new RagProperties(6, 0.62, new RagProperties.Ingest(false, 25, null, null, 0.5));

	private static SearchRequest capture(VectorStore store) {
		ArgumentCaptor<SearchRequest> captor = ArgumentCaptor.forClass(SearchRequest.class);
		verify(store).similaritySearch(captor.capture());
		return captor.getValue();
	}

	@Test
	@DisplayName("applies the configured threshold and topK")
	void appliesThresholdAndTopK() {
		VectorStore store = mock(VectorStore.class);
		when(store.similaritySearch(any(SearchRequest.class))).thenReturn(List.of());

		new SpringAiRagService(store, PROPS).retrieve("how much protein", "tenant-a", null, 6);

		SearchRequest request = capture(store);
		assertThat(request.getSimilarityThreshold()).isEqualTo(0.62);
		assertThat(request.getTopK()).isEqualTo(6);
		// The whole point: never Spring AI's accept-all default.
		assertThat(request.getSimilarityThreshold())
						.isNotEqualTo(SearchRequest.SIMILARITY_THRESHOLD_ACCEPT_ALL);
	}

	@Test
	@DisplayName("scopes the search to the caller's tenant and the shared corpus")
	void filtersByTenant() {
		VectorStore store = mock(VectorStore.class);
		when(store.similaritySearch(any(SearchRequest.class))).thenReturn(List.of());

		new SpringAiRagService(store, PROPS).retrieve("shoulder rehab", "tenant-a", null, 6);

		Filter.Expression expression = capture(store).getFilterExpression();
		assertThat(expression).isNotNull();
		assertThat(expression.toString()).contains(RagService.TENANT_KEY);
		assertThat(expression.toString()).contains("tenant-a");
		assertThat(expression.toString()).contains(RagService.GLOBAL_TENANT);
	}

	@Test
	@DisplayName("a missing tenant narrows to global, it must never widen the search")
	void blankTenantFailsClosed() {
		VectorStore store = mock(VectorStore.class);
		when(store.similaritySearch(any(SearchRequest.class))).thenReturn(List.of());

		new SpringAiRagService(store, PROPS).retrieve("anything", "  ", null, 6);

		Filter.Expression expression = capture(store).getFilterExpression();
		assertThat(expression).isNotNull();
		assertThat(expression.toString()).contains(RagService.GLOBAL_TENANT);
		// A filter is still present — the failure mode to prevent is an unfiltered
		// search that reaches every tenant in the store.
		assertThat(expression.toString()).contains(RagService.TENANT_KEY);
	}

	@Test
	@DisplayName("maps store hits to chunks and tolerates a null result")
	void mapsResults() {
		VectorStore store = mock(VectorStore.class);
		when(store.similaritySearch(any(SearchRequest.class)))
						.thenReturn(
										List.of(
														Document.builder()
														        .id("a")
														        .text("Deload weeks cut volume by 40 to 60 percent.")
														        .metadata(Map.of("source", "programming"))
														        .score(0.81)
														        .build()));

		List<RagChunk> chunks = new SpringAiRagService(store, PROPS).retrieve("deload", "t", null, 6);

		assertThat(chunks).hasSize(1);
		assertThat(chunks.get(0).source()).isEqualTo("programming");
		assertThat(chunks.get(0).score()).isEqualTo(0.81);
		assertThat(chunks.get(0).text()).contains("Deload");
	}

	@Test
	@DisplayName("a null result from the store is an empty list, not an NPE")
	void nullResultIsEmpty() {
		VectorStore store = mock(VectorStore.class);
		when(store.similaritySearch(any(SearchRequest.class))).thenReturn(null);

		assertThat(new SpringAiRagService(store, PROPS).retrieve("q", "t", null, 6)).isEmpty();
	}

	// ── Member scoping ────────────────────────────────────────────────────────
	//
	// Check-ins are private to one client and live in the same tenant as every
	// other client of that coach. A tenant-only filter would return them happily,
	// so this is the filter that keeps one client's words away from another.

	@Test
	@DisplayName("a named client sees their own material and the shared corpus, nothing else")
	void filtersByMember() {
		VectorStore store = mock(VectorStore.class);
		when(store.similaritySearch(any(SearchRequest.class))).thenReturn(List.of());

		new SpringAiRagService(store, PROPS).retrieve("how is it going", "tenant-a", "member-1", 6);

		String filter = capture(store).getFilterExpression().toString();
		assertThat(filter).contains("member-1").contains(RagService.NO_MEMBER);
		assertThat(filter).contains("tenant-a");
	}

	@Test
	@DisplayName("with no client named, nothing client-private is reachable at all")
	void excludesPrivateMaterialWithoutAMember() {
		VectorStore store = mock(VectorStore.class);
		when(store.similaritySearch(any(SearchRequest.class))).thenReturn(List.of());

		new SpringAiRagService(store, PROPS).retrieve("how is it going", "tenant-a", null, 6);

		// Only the sentinel. Asking about "a client" without naming one must not
		// quietly return whichever client happened to score highest.
		String filter = capture(store).getFilterExpression().toString();
		assertThat(filter).contains(RagService.NO_MEMBER);
		assertThat(filter).doesNotContain("member-1");
	}
}

