export interface PaginatedResponse<T> {
	docs: T[];
	meta: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	};
}
