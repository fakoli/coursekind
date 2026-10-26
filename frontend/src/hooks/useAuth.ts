import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { authApi } from '../api/auth';
import type { User, UserCreate, UserLogin } from '../types';

interface AuthState { verificationError: string | null; user: User | null; isLoading: boolean; isAuthenticated: boolean }
const signedOut: AuthState = { verificationError: null, user: null, isLoading: false, isAuthenticated: false };

export function useAuth(queryClient?: QueryClient) {
  const [registrationRecovery, setRegistrationRecovery] = useState(false);
  const [state, setState] = useState<AuthState>({ ...signedOut, isLoading: true });
  const identity = useRef<string | null>(null);
  const revision = useRef(0);
  const clearPrivateState = useCallback((token: string | null) => {
    revision.current += 1;
    identity.current = token;
    // Cancellation detaches even query functions that ignore AbortSignal.
    // Clear synchronously before exposing the next identity to descendants.
    void queryClient?.cancelQueries();
    queryClient?.clear();
    setState({ ...signedOut, isLoading: !!token });
  }, [queryClient]);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (identity.current !== token || !token) clearPrivateState(token);
    if (!token) return;
    const currentRevision = revision.current;
    try {
      const user = await authApi.me();
      if (localStorage.getItem('token') === token && revision.current === currentRevision) {
        setRegistrationRecovery(false);
        setState({ user, isLoading: false, isAuthenticated: true, verificationError: null });
      }
    } catch (error) {
      if (localStorage.getItem('token') === token && revision.current === currentRevision) {
        if (error instanceof ApiError && error.status === 401) {
          localStorage.removeItem('token');
          clearPrivateState(null);
        } else {
          clearPrivateState(token);
          setState({ ...signedOut, verificationError: 'Could not verify your session. Check your connection and retry.' });
        }
      }
    }
  }, [clearPrivateState]);

  useEffect(() => {
    // Synchronize the external session store before any authenticated descendants mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Auth boundary must clear caches synchronously before identity rendering.
    void checkAuth();
    const storage = (event: StorageEvent) => {
      if (event.key === 'token' || event.key === null) void checkAuth();
    };
    const expired = () => { void checkAuth(); };
    window.addEventListener('storage', storage);
    window.addEventListener('auth-expired', expired);
    return () => {
      window.removeEventListener('storage', storage);
      window.removeEventListener('auth-expired', expired);
    };
  }, [checkAuth]);

  useEffect(() => {
    if (!state.isAuthenticated) return;
    const token = localStorage.getItem('token');
    let expiresAt: number;
    try {
      const payload = JSON.parse(atob((token?.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/')));
      if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return;
      expiresAt = payload.exp * 1000;
    } catch { return; }
    let timer: ReturnType<typeof setTimeout>;
    const checkExpiry = () => {
      clearTimeout(timer);
      if (localStorage.getItem('token') !== token) return;
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        localStorage.removeItem('token');
        clearPrivateState(null);
      } else timer = setTimeout(checkExpiry, Math.min(remaining, 2147483647));
    };
    timer = setTimeout(checkExpiry, Math.max(0, Math.min(expiresAt - Date.now(), 2147483647)));
    window.addEventListener('focus', checkExpiry);
    return () => { clearTimeout(timer); window.removeEventListener('focus', checkExpiry); };
  }, [state.isAuthenticated, state.user, clearPrivateState]);

  const login = async (credentials: UserLogin) => {
    const attempt = ++revision.current;
    const response = await authApi.login(credentials);
    if (attempt !== revision.current) return;
    localStorage.setItem('token', response.access_token);
    clearPrivateState(response.access_token);
    const currentRevision = revision.current;
    try {
      const user = await authApi.me();
      if (localStorage.getItem('token') === response.access_token && currentRevision === revision.current) {
        setRegistrationRecovery(false);
        setState({ user, isLoading: false, isAuthenticated: true, verificationError: null });
      }
    } catch (error) {
      if (localStorage.getItem('token') === response.access_token && currentRevision === revision.current) {
        if (error instanceof ApiError && error.status === 401) {
          localStorage.removeItem('token');
          clearPrivateState(null);
        } else {
          setState({ ...signedOut, verificationError: 'Could not verify your session. Check your connection and retry.' });
        }
      }
      throw new Error('Login failed');
    }
  };

  const register = async (data: UserCreate) => {
    await authApi.register(data);
    try {
      await login({ email: data.email, password: data.password });
    } catch {
      // Keep partial success above the page lifetime: verification can unmount
      // Register while a new token is checked, so page-local state is insufficient.
      setRegistrationRecovery(true);
      throw new Error('Your account was created, but automatic sign-in failed. Please sign in.');
    }
  };
  const logout = async () => {
    // Capture the authenticated request first, then end the local session immediately.
    const pending = authApi.logout();
    localStorage.removeItem('token');
    clearPrivateState(null);
    await pending;
  };
  const continueToSignIn = () => {
    localStorage.removeItem('token');
    clearPrivateState(null);
    setRegistrationRecovery(false);
  };
  return { ...state, login, register, logout, checkAuth, registrationRecovery, continueToSignIn };
}
