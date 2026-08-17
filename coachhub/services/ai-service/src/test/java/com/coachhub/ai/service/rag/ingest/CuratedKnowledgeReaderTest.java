package com.coachhub.ai.service.rag.ingest;

import com.coachhub.ai.service.rag.RagService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CuratedKnowledgeReaderTest {

	@Test
	@DisplayName("splits on headings and keeps the heading with its section")
	void splitsOnHeadings() {
		List<String> sections =
						CuratedKnowledgeReader.split(
										"""
														# Title

														## First idea

														Body of the first idea.

														## Second idea

														Body of the second idea.
														""");

		assertThat(sections).hasSize(2);
		// The heading is the most searchable line in the chunk, so it must travel with it.
		assertThat(sections.get(0)).startsWith("## First idea");
		assertThat(sections.get(0)).contains("Body of the first idea.");
		assertThat(sections.get(1)).startsWith("## Second idea");
		// Sections must not bleed into each other.
		assertThat(sections.get(0)).doesNotContain("second idea");
	}

	@Test
	@DisplayName("a bare title with no prose is not a chunk")
	void dropsHeadingOnlyPreamble() {
		List<String> sections = CuratedKnowledgeReader.split("# Just a title\n\n## Real section\n\nText.\n");

		assertThat(sections).hasSize(1);
		assertThat(sections.get(0)).startsWith("## Real section");
	}

	@Test
	@DisplayName("derives the source name from the filename")
	void derivesSourceName() {
		assertThat(CuratedKnowledgeReader.sourceName("progressive-overload.md"))
						.isEqualTo("progressive-overload");
		assertThat(CuratedKnowledgeReader.sourceName("nutrition")).isEqualTo("nutrition");
		assertThat(CuratedKnowledgeReader.sourceName(null)).isEqualTo("coaching-knowledge");
	}

	@Test
	@DisplayName("the shipped corpus loads and is big enough for retrieval to mean anything")
	void shippedCorpusIsSubstantial() {
		List<KnowledgeDocument> docs = new CuratedKnowledgeReader().readAll();

		// The bug this whole change exists to fix was a corpus of 4 documents against
		// a topK of 4, where the search returned everything and selected nothing.
		// Well above topK is the property that matters, so it is asserted rather than
		// left to be noticed later.
		assertThat(docs.size()).isGreaterThan(30);
		assertThat(docs).allSatisfy(d -> {
			assertThat(d.tenantId()).isEqualTo(RagService.GLOBAL_TENANT);
			assertThat(d.origin()).isEqualTo(KnowledgeDocument.ORIGIN_CURATED);
			assertThat(d.text()).isNotBlank();
			assertThat(d.id()).isNotBlank();
		});
		// Ids must be unique or the ingest would silently drop material.
		assertThat(docs.stream().map(KnowledgeDocument::id).distinct().count())
						.isEqualTo(docs.size());
	}
}
