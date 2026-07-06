package com.coachhub.ai.service.rag;

/**
 * A single piece of retrieved knowledge-base context.
 *
 * @param text   the chunk content
 * @param source where the chunk came from (e.g. the {@code source} metadata key)
 * @param score  similarity score in [0, 1]; higher is more relevant
 */
public record RagChunk(String text, String source, double score) {
}
