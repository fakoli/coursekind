import { ApiError } from '../api/client';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { authApi } from '../api/auth';
import { useAuth } from './useAuth';

// Mock the API layer entirely — no network, no backend.
vi.mock('../api/auth', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    getTokenBalance: vi.fn(),
    consumeTokens: vi.fn(),
  },
}));

const mockAuthApi = vi.mocked(authApi);

const TOKEN_KEY = 'token';

function setToken(value: string | null) {
  if (value === null) {
    localStorage.removeItem(TOKEN_KEY);
  } else {
    localStorage.setItem(TOKEN_KEY, value);
  }
}

const user: { id: string; email: string; name: string; role: string } = {
  id: 'u1',
  email: 'a@b.com',
  name: 'A',
  role: 'user',
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAuth', () => {
  it('starts unauthenticated when no token exists', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('restores the session from an existing valid token', async () => {
    setToken('valid-token');
    mockAuthApi.me.mockResolvedValue(user as never);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.user).toEqual(user);
    expect(mockAuthApi.me).toHaveBeenCalledTimes(1);
  });

  it('clears the token when it is stale/invalid', async () => {
    setToken('stale-token');
    mockAuthApi.me.mockRejectedValue(new ApiError('401', 401) as never);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('login stores the token and authenticates', async () => {
    mockAuthApi.login.mockResolvedValue({ access_token: 'new-token' } as never);
    mockAuthApi.me.mockResolvedValue(user as never);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login({ email: 'a@b.com', password: 'pw' });
    });

    expect(localStorage.getItem(TOKEN_KEY)).toBe('new-token');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(user);
  });

  it('login removes the token and throws if /auth/me fails', async () => {
    mockAuthApi.login.mockResolvedValue({ access_token: 'new-token' } as never);
    mockAuthApi.me.mockRejectedValue(new ApiError('Invalid token', 401) as never);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await expect(result.current.login({ email: 'a@b.com', password: 'pw' })).rejects.toThrow(
        'Login failed',
      );
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('logout clears the token even when the API call fails', async () => {
    setToken('token-1');
    mockAuthApi.logout.mockRejectedValue(new Error('network') as never);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      // The hook's `finally` must clear storage even though logout() rejects.
      await expect(result.current.logout()).rejects.toThrow('network');
    });

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('REGRESSION: a slow in-flight checkAuth failure must not wipe a token replaced by a concurrent login', async () => {
    // The production bug: mount with token A -> checkAuth(stale, in-flight, slow)
    // -> login() replaces token with B -> slow checkAuth resolves failure
    // -> old code removed B (the fresh session). The new code must leave B alone.
    setToken('token-A');
    const staleMe = vi.fn();
    staleMe.mockReturnValue(new Promise((_, reject) => setTimeout(() => reject(new ApiError('401', 401)), 20)));
    mockAuthApi.me.mockImplementationOnce(staleMe as never);

    const { result } = renderHook(() => useAuth());

    // While checkAuth is in flight, a concurrent login replaces the token.
    mockAuthApi.login.mockResolvedValue({ access_token: 'token-B' } as never);
    mockAuthApi.me.mockResolvedValueOnce(user as never);
    await act(async () => {
      await result.current.login({ email: 'a@b.com', password: 'pw' });
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-B');
    expect(result.current.isAuthenticated).toBe(true);

    // Now let the stale checkAuth failure resolve. It must NOT remove token-B.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-B');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('cross-tab storage events re-check auth and converge state when the token changes', async () => {
    setToken('token-1');
    mockAuthApi.me.mockResolvedValue(user as never);
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(mockAuthApi.me).toHaveBeenCalledTimes(1);

    // Simulate another tab logging out: it removes the shared token and
    // fires a storage event (newValue null).
    setToken(null);
    mockAuthApi.me.mockResolvedValue(user as never);
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY, newValue: null }));
    });
    // After re-check, no token -> must converge to signed-out, not just
    // "re-called me()". (me() is NOT called again: checkAuth short-circuits
    // on the missing token and sets signed-out directly.)
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(result.current.user).toBeNull();
    expect(mockAuthApi.me).toHaveBeenCalledTimes(1);
  });

  it('REGRESSION: a slow checkAuth SUCCESS must not paint an old user over a concurrent login (account-mismatch clobber)', async () => {
    // Mirror of the failure-side regression: mount with token-A, checkAuth
    // (in-flight, slow, will SUCCEED with userA). While in flight, a
    // concurrent login replaces the token with B and authenticates as userB.
    // When the stale checkAuth success lands, it must NOT overwrite userB
    // with userA nor mark us authenticated against the old token.
    setToken('token-A');
    const userA = { id: 'uA', email: 'old@a.com', name: 'Old A', role: 'user' } as const;
    const userB = { id: 'uB', email: 'new@b.com', name: 'New B', role: 'user' } as const;
    const staleMe = vi.fn();
    staleMe.mockReturnValue(new Promise((resolve) => setTimeout(() => resolve(userA), 20)));
    mockAuthApi.me.mockImplementationOnce(staleMe as never);

    const { result } = renderHook(() => useAuth());

    // Concurrent login writes token-B and authenticates as userB.
    mockAuthApi.login.mockResolvedValue({ access_token: 'token-B' } as never);
    mockAuthApi.me.mockResolvedValueOnce(userB as never);
    await act(async () => {
      await result.current.login({ email: 'new@b.com', password: 'pw' });
    });
    expect(result.current.user).toEqual(userB);

    // Let the stale checkAuth success resolve. The guard must keep userB.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-B');
    expect(result.current.user).toEqual(userB);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('REGRESSION: logout during an in-flight login must not resurrect auth (logout-resurrection race)', async () => {
    // login(B) writes token-B, then its me() is slow. A logout completes
    // meanwhile (removes token-B, sets signed-out). When login's me() lands,
    // the hook must NOT mark authenticated with no token in storage.
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Login B: the login() writes token-B, then me() for B is slow.
    mockAuthApi.login.mockResolvedValue({ access_token: 'token-B' } as never);
    const slowMe = vi.fn();
    slowMe.mockReturnValue(new Promise((resolve) => setTimeout(() => resolve(user), 30)));
    mockAuthApi.me.mockImplementationOnce(slowMe as never);
    let loginPromise!: Promise<void>;
    act(() => {
      loginPromise = result.current.login({ email: 'b@b.com', password: 'pw' });
    });

    // Logout lands first: removes token-B, signs out.
    mockAuthApi.logout.mockResolvedValue({} as never);
    await act(async () => {
      await result.current.logout();
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);

    // Now login's slow me() resolves — the guard must NOT resurrect auth
    // (token was removed; a signed-out UI with no token is correct).
    await act(async () => {
      await loginPromise;
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
