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

  if (token !== localStorage.getItem('token') && path !== '/auth/logout') {
    throw new ApiError('Session changed. Please try again.', 401);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 401 && token && token === localStorage.getItem('token')) {
      localStorage.removeItem('token');
      window.dispatchEvent(new Event('auth-expired'));
    }
    const detail = error.error?.message || error.detail;
    const message = typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map(item => `${Array.isArray(item.loc) ? item.loc.filter((part: unknown) => part !== 'body').join('.') + ': ' : ''}${typeof item.msg === 'string' ? item.msg : 'Invalid value'}`).join('; ')
      : 'Request failed';
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json();
  if (token !== localStorage.getItem('token') && path !== '/auth/logout') throw new ApiError('Session changed. Please try again.', 401);
  return data;
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
