import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { useAuth } from './useAuth';
import { authApi } from '../api/auth';
vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), login: vi.fn(), logout: vi.fn() } }));
const user = { id: 'a', name: 'A' };
beforeEach(() => { localStorage.clear(); vi.resetAllMocks(); });
it('clears all private caches and cancels old results before rendering another identity', async () => {
  const client = new QueryClient();
  localStorage.setItem('token', 'a');
  vi.mocked(authApi.me).mockResolvedValue(user as never);
  const { result } = renderHook(() => useAuth(client));
  await waitFor(() => expect(result.current.user?.id).toBe('a'));
  client.setQueryData(['dashboard'], { privateTitle: 'A secret' });
  client.setQueryData(['ai-preferences', 'a'], { model: 'private' });
  let resolve!: (data: string) => void;
  const pending = client.fetchQuery({ queryKey: ['courses'], queryFn: () => new Promise<string>(r => { resolve = r; }) }).catch(() => undefined);
  vi.mocked(authApi.login).mockResolvedValue({ access_token: 'b' } as never);
  vi.mocked(authApi.me).mockResolvedValue({ id: 'b' } as never);
  await act(async () => { await result.current.login({ email: 'b@example.com', password: 'password' }); });
  expect(result.current.user?.id).toBe('b');
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  resolve('A private courses'); await pending;
  expect(client.getQueryData(['courses'])).toBeUndefined();
});
it.each(['storage', 'auth-expired'])('clears rendered identity and private data on %s', async event => {
  const client = new QueryClient(); localStorage.setItem('token', 'a');
  vi.mocked(authApi.me).mockResolvedValue(user as never);
  const { result } = renderHook(() => useAuth(client));
  await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
  client.setQueryData(['notifications'], 'A private');
  await act(async () => {
    localStorage.removeItem('token');
    window.dispatchEvent(event === 'storage' ? new StorageEvent('storage', { key: null }) : new Event(event));
  });
  expect(result.current.user).toBeNull();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
it('clears an expired verified JWT even while no query is being fetched', async () => {
  vi.useFakeTimers();
  try {
    const client = new QueryClient();
    const token = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 10 }))}.signature`;
    localStorage.setItem('token', token);
    vi.mocked(authApi.me).mockResolvedValue(user as never);
    const { result } = renderHook(() => useAuth(client));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.isAuthenticated).toBe(true);
    client.setQueryData(['dashboard'], 'private');
    await act(async () => { await vi.advanceTimersByTimeAsync(11000); });
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  } finally { vi.useRealTimers(); }
});
it('keeps credentials behind a retryable privacy gate after temporary verification failure', async () => {
  const client = new QueryClient(); localStorage.setItem('token', 'a');
  vi.mocked(authApi.me).mockRejectedValueOnce(new TypeError('Network unavailable'));
  const { result } = renderHook(() => useAuth(client));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(localStorage.getItem('token')).toBe('a');
  expect(result.current.user).toBeNull();
  expect(result.current.verificationError).toMatch(/verify/i);
  vi.mocked(authApi.me).mockResolvedValue(user as never);
  await act(async () => { await result.current.checkAuth(); });
  expect(result.current.isAuthenticated).toBe(true);
  expect(result.current.verificationError).toBeNull();
});
