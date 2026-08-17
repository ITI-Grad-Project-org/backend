package com.coachhub.ai.service.rag;

import java.util.List;

public interface RagService {

	String TENANT_KEY = "tenantId";

	String GLOBAL_TENANT = "__global__";

	String MEMBER_KEY = "membershipId";

	/**
	 * Stands in for "this chunk is not about one particular client".
	 *
	 * A sentinel rather than an absent field, for the same reason {@link #GLOBAL_TENANT} is one: an
	 * Atlas filter can test equality against a value, and expressing "the field is missing OR equals
	 * X" is both awkward and easy to get subtly wrong. A wrong tenant filter leaks a coach's library;
	 * a wrong member filter leaks one client's check-ins to another.
	 */
	String NO_MEMBER = "__none__";

	/**
	 * @param membershipId when set, restricts retrieval to that client's own material plus everything
	 *     not tied to a client. Null retrieves only the latter — never another member's notes.
	 */
	List<RagChunk> retrieve(String query, String tenantId, String membershipId, int topK);
}
