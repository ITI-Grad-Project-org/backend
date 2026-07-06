export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	message?: string;
	error?: any;
	meta?: {
		total: number;
		page: number;
		limit: number;
	};
}
