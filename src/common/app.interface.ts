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
