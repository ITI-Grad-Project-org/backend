package com.coachhub.ai.service.rag;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class SpringAiRagService implements RagService {
	private final VectorStore vectorStore;

	public SpringAiRagService(VectorStore vectorStore) {
		this.vectorStore = vectorStore;
	}

	@Override
	public List<RagChunk> retrieve(String query, int topK) {
		SearchRequest request = SearchRequest.builder()
		                                     .query(query)
		                                     .topK(topK)
		                                     // .similarityThreshold(0.5)  // optional: drop weak matches
		                                     .build();

		List<Document> results = vectorStore.similaritySearch(request);
		if (results == null) {
			return List.of();
		}

		return results.stream()
		              .map(doc -> new RagChunk(
						              doc.getText(), // Spring AI 1.0+; older versions: getContent()
						              String.valueOf(doc.getMetadata().getOrDefault("source", "kb")),
						              doc.getScore() == null ? 0.0 : doc.getScore()))
		              .toList();
	}
}
