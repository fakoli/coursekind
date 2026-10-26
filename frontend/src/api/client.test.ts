import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './client';

// jsdom provides fetch? No — provide a minimal fetch stub.
const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
});

describe('api client', () => {
  it('injects the auth token into the Authorization header', async () => {
    localStorage.setItem('token', 'secret-token');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await api.get('/auth/me');

    const [url, init] = fetchMock.mock.calls[0];
    // The URL is BASE_URL + path; BASE_URL defaults to /api/v1 but a dev's
    // .env.local (VITE_API_URL) may override it. Assert via the same
    // resolution so the spec is environment-proof.
    expect(url).toContain(
      `${(import.meta.env.VITE_API_URL as string | undefined) || '/api/v1'}/auth/me`
    );
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('omits the Authorization header when no token is stored', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await api.get('/public');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('normalizes a non-2xx response into an ApiError with the server detail', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Token expired' }), { status: 401 }),
    );
    await expect(api.get('/auth/me')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Token expired',
      status: 401,
    });
  });

  it('falls back to a generic message when the error body has no detail', async () => {
    fetchMock.mockResolvedValue(new Response('oops', { status: 500 }));
    await expect(api.get('/x')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Request failed',
      status: 500,
    });
  });

  it('returns the parsed JSON body on success', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'c1', title: 'Intro' }), { status: 200 }),
    );
    const data = await api.get('/courses/c1');
    expect(data).toEqual({ id: 'c1', title: 'Intro' });
  });

  it('handles 204 No Content as empty', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const data = await api.delete('/courses/c1');
    expect(data).toEqual({});
  });

  it('posts JSON bodies on POST', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await api.post('/courses', { title: 'New' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'New' }));
  });
});

describe('ApiError', () => {
  it('is an instanceof Error with name ApiError', () => {
    const e = new ApiError('x', 404);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ApiError');
    expect(e.status).toBe(404);
  });
});

it('renders FastAPI validation messages without object coercion', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: [{ loc: ['body','phone_number'], msg: 'Use E.164', type: 'value_error' }] }), { status: 422 }));
  await expect(api.put('/preferences', {})).rejects.toThrow('phone_number: Use E.164');
});
it('rejects a response from a previous identity', async () => {
  localStorage.setItem('token', 'a');
  let resolve!: (value: Response) => void;
  fetchMock.mockReturnValue(new Promise<Response>(r => { resolve = r; }));
  const pending = api.get('/private');
  localStorage.setItem('token', 'b'); resolve(new Response('{"secret":"a"}'));
  await expect(pending).rejects.toThrow('Session changed');
});
it('expires the current identity on 401 but never clears a replacement token for an old 401', async () => {
  localStorage.setItem('token', 'a');
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'INVALID_TOKEN', message: 'Please sign in again' } }), { status: 401 }));
  await expect(api.get('/private')).rejects.toThrow('Please sign in again');
  expect(localStorage.getItem('token')).toBeNull();
  localStorage.setItem('token', 'a');
  let resolve!: (value: Response) => void;
  fetchMock.mockReturnValue(new Promise<Response>(r => { resolve = r; }));
  const pending = api.get('/private');
  localStorage.setItem('token', 'b');
  resolve(new Response('{}', { status: 401 }));
  await expect(pending).rejects.toThrow('Session changed');
  expect(localStorage.getItem('token')).toBe('b');
});

it.each(['sign-out', 'account-switch'])('rejects late workspace mutation after %s', async (event) => {
  localStorage.setItem('token', 'synthetic-a');
  let resolve!: (value: Response) => void;
  fetchMock.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
  const pending = api.post('/workspaces', { request_id: 'synthetic', brief: { goal: 'Private goal' } });
  if (event === 'sign-out') localStorage.removeItem('token');
  else localStorage.setItem('token', 'synthetic-b');
  resolve(new Response(JSON.stringify({ id: 'private-workspace', owner_id: 'a' })));
  await expect(pending).rejects.toThrow('Session changed');
});
