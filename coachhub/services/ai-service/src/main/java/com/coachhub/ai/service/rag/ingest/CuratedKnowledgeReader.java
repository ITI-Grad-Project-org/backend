package com.coachhub.ai.service.rag.ingest;

import com.coachhub.ai.service.rag.RagService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Loads the curated coaching corpus shipped with the service, under
 * {@code src/main/resources/kb/*.md}.
 *
 * <p>core_db cannot be the whole knowledge base. It knows what a barbell row is and what Sara's
 * injuries are, but nothing in it answers "how fast should I add weight" or "when does a client
 * need a deload" — those are domain knowledge, not tenant data. This reader supplies that half,
 * marked {@link RagService#GLOBAL_TENANT} so every coach can retrieve it. It also means a fresh
 * environment with an empty database still has a working assistant.
 */
@Component
public class CuratedKnowledgeReader {

	private static final Logger log = LoggerFactory.getLogger(CuratedKnowledgeReader.class);

	private static final String LOCATION = "classpath:kb/*.md";

	/**
	 * Chunks are split on markdown {@code ##} headings rather than by token count.
	 *
	 * <p>A token splitter would cut "protein is 1.6 to" / "2.2 g per kg" across two chunks and make
	 * both unusable. The files are written so that each {@code ##} section is one self-contained
	 * idea, which is the unit a coach actually asks about, so the document structure is the
	 * chunking strategy.
	 */
	private static final String SECTION_DELIMITER = "\n## ";

	private final PathMatchingResourcePatternResolver resolver =
					new PathMatchingResourcePatternResolver();

	public List<KnowledgeDocument> readAll() {
		Resource[] files;
		try {
			files = resolver.getResources(LOCATION);
		} catch (IOException ex) {
			log.warn("could not list {} — curated knowledge unavailable: {}", LOCATION, ex.getMessage());
			return List.of();
		}

		List<KnowledgeDocument> docs = new ArrayList<>();
		for (Resource file : files) {
			String source = sourceName(file.getFilename());
			try {
				String body = new String(file.getContentAsByteArray(), StandardCharsets.UTF_8);
				for (String section : split(body)) {
					docs.add(
									KnowledgeDocument.of(
													RagService.GLOBAL_TENANT,
													source,
													KnowledgeDocument.ORIGIN_CURATED,
													section));
				}
			} catch (IOException ex) {
				log.warn("skipping curated file {}: {}", file.getFilename(), ex.getMessage());
			}
		}
		log.debug("read {} curated chunks from {} files", docs.size(), files.length);
		return docs;
	}

	/**
	 * Splits on {@code ##} and puts the heading back on each section, because the heading is often
	 * the most searchable line in it — "Deload weeks" is closer to a coach's wording than the
	 * paragraph explaining what one is.
	 */
	static List<String> split(String markdown) {
		List<String> sections = new ArrayList<>();
		String[] parts = markdown.split(SECTION_DELIMITER);
		for (int i = 0; i < parts.length; i++) {
			String part = parts[i].trim();
			if (part.isEmpty()) {
				continue;
			}
			// The first part is everything above the first '## ' — the file's title and
			// any preamble. Keep it only if it has content of its own.
			String section = (i == 0) ? part : "## " + part;
			if (section.lines().filter(l -> !l.isBlank() && !l.startsWith("#")).findAny().isPresent()) {
				sections.add(section);
			}
		}
		return sections;
	}

	/** {@code progressive-overload.md} → {@code progressive-overload}. */
	static String sourceName(String filename) {
		if (filename == null || filename.isBlank()) {
			return "coaching-knowledge";
		}
		int dot = filename.lastIndexOf('.');
		return dot > 0 ? filename.substring(0, dot) : filename;
	}
}
