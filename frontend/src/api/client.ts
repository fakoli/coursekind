const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(error.error?.message || error.detail || 'Request failed', response.status);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(path: string, data: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: <T>(path: string) =>
    request<T>(path, {
      method: 'DELETE',
    }),
};
