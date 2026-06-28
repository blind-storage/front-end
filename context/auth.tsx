'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as api from '@/lib/api';
import type { UserResponse } from '@/lib/api';
import { clearToken, loadToken, saveToken } from '@/lib/storage';

export type { UserResponse };

interface AuthState {
  token: string | null;
  user: UserResponse | null;
  // Private key decrypted in memory — never persisted to disk or localStorage
  privateKey: CryptoKey | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  setSession(token: string, user: UserResponse, privateKey: CryptoKey): void;
  updateUser(user: UserResponse): void;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    token: null,
    user: null,
    privateKey: null,
    isLoading: loadToken() !== null,
  }));

  // On mount: restore JWT from localStorage and reload user profile.
  // The private key is NOT restored — the user must re-enter their password if the page refreshes.
  useEffect(() => {
    const token = loadToken();
    if (!token) return;
    api
      .getProfile(token)
      .then((profile) => api.getUser(profile.id, token))
      .then((user) => setState({ token, user, privateKey: null, isLoading: false }))
      // privateKey is null after a page refresh — the user must re-enter their password
      .catch(() => {
        clearToken();
        setState({ token: null, user: null, privateKey: null, isLoading: false });
      });
  }, []);

  const setSession = useCallback((token: string, user: UserResponse, privateKey: CryptoKey) => {
    saveToken(token);
    setState({ token, user, privateKey, isLoading: false });
  }, []);

  const updateUser = useCallback((user: UserResponse) => {
    setState((s) => ({ ...s, user }));
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ token: null, user: null, privateKey: null, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, setSession, updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
