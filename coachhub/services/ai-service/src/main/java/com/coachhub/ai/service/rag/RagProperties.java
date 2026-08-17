package com.coachhub.ai.service.rag;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "coachhub.rag")
public record RagProperties(int topK, double similarityThreshold, Ingest ingest) {

	public RagProperties {
		if (topK <= 0) {
			topK = 6;
		}
		if (similarityThreshold <= 0.0) {
			similarityThreshold = 0.62;
		}
		if (ingest == null) {
			ingest = new Ingest(true, 0, null, null, 0.0);
		}
	}

	public record Ingest(
					boolean enabled,
					int batchSize,
					Duration initialDelay,
					Duration interval,
					double maxPruneRatio) {

		public Ingest {

			if (batchSize <= 0) {
				batchSize = 25;
			}

			if (initialDelay == null) {
				initialDelay = Duration.ofSeconds(30);
			}
			if (interval == null) {
				interval = Duration.ofMinutes(30);
			}
			// A run that wants to delete most of the corpus is reporting a fault, not
			// a change: core_db unreachable, a rendering tweak that rewrote every id,
			// or the wrong database entirely. Above this share of the collection the
			// prune is refused and logged. 0 disables the guard.
			if (maxPruneRatio <= 0.0 || maxPruneRatio > 1.0) {
				maxPruneRatio = 0.5;
			}
		}
	}
}
