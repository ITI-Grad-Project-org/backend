package com.coachhub.ai.service.rag;

import java.util.List;

public interface RagService {

	String TENANT_KEY = "tenantId";

	String GLOBAL_TENANT = "__global__";

	List<RagChunk> retrieve(String query, String tenantId, int topK);
}
