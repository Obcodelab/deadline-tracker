export interface ApiError<T = unknown> {
  code: string;
  detail?: T;
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  message: string;
  data: T | null;
  error: ApiError | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}
