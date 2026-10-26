import { Link } from 'react-router-dom';
import { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { AuthContext } from './AuthContext';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const auth = useAuth(useQueryClient());

  return (
    <AuthContext.Provider value={auth}>
      {auth.registrationRecovery ? (
        <div role="alert" className="p-6 space-y-3">
          <p>Your account was created, but automatic sign-in failed. Please sign in to continue.</p>
          <Link to="/login" onClick={auth.continueToSignIn} className="inline-block px-3 py-2 underline">Sign in</Link>
        </div>
      ) : auth.isLoading ? <p role="status">Checking session…</p> : auth.verificationError ? (
        <div role="alert" className="p-6 space-y-3">
          <p>{auth.verificationError}</p>
          <button className="px-3 py-2 underline" onClick={() => { void auth.checkAuth(); }}>Retry session</button>
          <button className="px-3 py-2 underline" onClick={() => { void auth.logout().catch(() => undefined); }}>Sign out</button>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
}
