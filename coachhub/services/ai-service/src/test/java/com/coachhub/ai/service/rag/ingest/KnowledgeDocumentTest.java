package com.coachhub.ai.service.rag.ingest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The content-addressed id is what makes the ingest re-runnable, so its properties are asserted
 * rather than assumed. Break any of these and the knowledge base either duplicates on every sync or
 * silently merges one tenant's material into another's.
 */
class KnowledgeDocumentTest {

	@Test
	@DisplayName("same content produces the same id, so an unchanged row is never re-embedded")
	void idIsStableAcrossRuns() {
		KnowledgeDocument first =
						KnowledgeDocument.of("tenant-a", "exercise-library", "core-db", "Exercise: Squat.");
		KnowledgeDocument second =
						KnowledgeDocument.of("tenant-a", "exercise-library", "core-db", "Exercise: Squat.");

		assertThat(first.id()).isEqualTo(second.id());
	}

	@Test
	@DisplayName("edited content produces a new id, so the edit is picked up and the old row pruned")
	void editedContentChangesId() {
		KnowledgeDocument before =
						KnowledgeDocument.of("tenant-a", "exercise-library", "core-db", "Exercise: Squat.");
		KnowledgeDocument after =
						KnowledgeDocument.of(
										"tenant-a", "exercise-library", "core-db", "Exercise: Back Squat.");

		assertThat(before.id()).isNotEqualTo(after.id());
	}

	@Test
	@DisplayName("identical text under two tenants stays two documents")
	void tenantIsPartOfTheIdentity() {
		// This is the real case, not a hypothetical: every tenant's library is copied
		// from the same 100 default exercises, so the text genuinely is identical.
		// Hashing text alone would collapse them into one shared document.
		String text = "Exercise: Barbell Bench Press.";
		KnowledgeDocument a = KnowledgeDocument.of("tenant-a", "exercise-library", "core-db", text);
		KnowledgeDocument b = KnowledgeDocument.of("tenant-b", "exercise-library", "core-db", text);

		assertThat(a.id()).isNotEqualTo(b.id());
	}

	@Test
	@DisplayName("same text from a different source stays two documents")
	void sourceIsPartOfTheIdentity() {
		String text = "Deload weeks cut volume by half.";
		KnowledgeDocument a = KnowledgeDocument.of("__global__", "programming", "curated", text);
		KnowledgeDocument b = KnowledgeDocument.of("__global__", "coaching-practice", "curated", text);

		assertThat(a.id()).isNotEqualTo(b.id());
	}
}
