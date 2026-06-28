package com.coachhub.ai.service.rag;

import java.util.List;

/**
 * Retrieves relevant knowledge-base context for a query (the "R" in RAG).
 */
public interface RagService {

	/**
	 * @param query the user query to find context for
	 * @param topK  maximum number of chunks to return
	 * @return the most relevant chunks, ordered best-first (never {@code null})
	 */
	List<RagChunk> retrieve(String query, int topK);
}
