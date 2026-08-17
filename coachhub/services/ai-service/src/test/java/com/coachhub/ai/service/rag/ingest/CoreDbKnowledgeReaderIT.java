package com.coachhub.ai.service.rag.ingest;

import com.coachhub.ai.service.rag.RagService;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs the real ingest queries against a real core_db.
 *
 * <p>Opt-in and off by default — CI has no Postgres, and this needs the actual schema rather than a
 * fixture. It exists because the six queries in {@link CoreDbKnowledgeReader} are the one part of
 * the ingest that unit tests cannot cover: a renamed column or a changed enum cast fails here and
 * nowhere else, and in production it would surface only as a knowledge base that quietly stopped
 * growing.
 *
 * <p>Nothing is written and no vector store is involved — it reads, renders and asserts.
 *
 * <pre>
 * kubectl -n coachhub port-forward svc/postgres 55432:5432 &amp;
 * CORE_DB_URL=jdbc:postgresql://localhost:55432/core_db \
 * CORE_DB_USER=analytics_user CORE_DB_PASSWORD=... \
 *   mvn test -Dtest=CoreDbKnowledgeReaderIT
 * </pre>
 */
@EnabledIfEnvironmentVariable(named = "CORE_DB_URL", matches = ".+")
class CoreDbKnowledgeReaderIT {

	private static NamedParameterJdbcTemplate jdbc() {
		HikariConfig config = new HikariConfig();
		config.setJdbcUrl(System.getenv("CORE_DB_URL"));
		config.setUsername(System.getenv().getOrDefault("CORE_DB_USER", "analytics_user"));
		config.setPassword(System.getenv().getOrDefault("CORE_DB_PASSWORD", "secret"));
		config.setReadOnly(true);
		config.setMaximumPoolSize(2);
		return new NamedParameterJdbcTemplate(new HikariDataSource(config));
	}

	@Test
	@DisplayName("every source query runs against the live schema and renders usable text")
	void readsRealDatabase() {
		List<KnowledgeDocument> docs = new CoreDbKnowledgeReader(jdbc()).readAll();

		Map<String, Long> bySource =
						docs.stream()
						    .collect(Collectors.groupingBy(KnowledgeDocument::source, Collectors.counting()));
		System.out.println("chunks by source: " + bySource);
		System.out.println(
						"tenants: " + docs.stream().map(KnowledgeDocument::tenantId).distinct().count());
		docs.stream().findFirst().ifPresent(d -> System.out.println("\nsample:\n" + d.text()));

		assertThat(docs).isNotEmpty();
		assertThat(docs).allSatisfy(d -> {
			assertThat(d.tenantId()).isNotBlank();
			assertThat(d.text()).isNotBlank();
			// A rendering bug that leaves raw enum values in place is the failure this
			// catches — it does not break anything, it just quietly makes chunks
			// unmatchable.
			assertThat(d.text()).doesNotContain("null");
		});
		assertThat(docs.stream().map(KnowledgeDocument::id).distinct().count()).isEqualTo(docs.size());
	}

	/**
	 * Which sources carry one client's private material, and must therefore be scoped to that client.
	 *
	 * <p>This is the assertion that would have caught the intake leak. An intake was read through
	 * {@code read} rather than {@code readPerMember}, so every one of them was tagged {@code __none__}
	 * — the sentinel for "about nobody in particular" — which is a member every filter includes. A
	 * client asking their own question retrieved another client's injuries, medical conditions and
	 * allergies, and nothing failed: the answer was simply grounded in the wrong person's file.
	 *
	 * <p>It has to run against real data. The routing is one method call per source and reads
	 * correctly either way; only the rows coming back prove which one was used.
	 */
	@Test
	@DisplayName("private sources are scoped to a member, shared sources are not")
	void scopesPrivateSourcesToTheirMember() {
		List<KnowledgeDocument> docs = new CoreDbKnowledgeReader(jdbc()).readAll();

		List<String> privateSources =
						List.of(CoreDbKnowledgeReader.SOURCE_INTAKE, CoreDbKnowledgeReader.SOURCE_CHECKIN);

		assertThat(docs)
						.filteredOn(d -> privateSources.contains(d.source()))
						.isNotEmpty()
						.allSatisfy(
										d ->
														assertThat(d.membershipId())
																		.as("%s must belong to one client", d.source())
																		.isNotEqualTo(RagService.NO_MEMBER));

		// The other way round matters just as much: tagging the exercise library with a
		// member would hide a coach's own library from every question that did not name
		// a client, which looks like the assistant having forgotten it.
		assertThat(docs)
						.filteredOn(d -> !privateSources.contains(d.source()))
						.isNotEmpty()
						.allSatisfy(
										d ->
														assertThat(d.membershipId())
																		.as("%s belongs to no one client", d.source())
																		.isEqualTo(RagService.NO_MEMBER));
	}
}
