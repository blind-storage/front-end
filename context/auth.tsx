'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as api from '@/lib/api';
import type { UserResponse } from '@/lib/api';
import {
  exportPrivateKeyBytes,
  exportSigningPrivateKeyBytes,
  fromBase64,
  importPrivateKey,
  importSigningPrivateKey,
  toBase64,
} from '@/lib/crypto';
import {
  clearPrivateKey,
  clearSigningPrivateKey,
  clearToken,
  loadPrivateKey,
  loadSigningPrivateKey,
  loadToken,
  savePrivateKey,
  saveSigningPrivateKey,
  saveToken,
} from '@/lib/storage';

export type { UserResponse };

interface AuthState {
  token: string | null;
  user: UserResponse | null;
  // Private key decrypted in memory — never persisted to disk or localStorage
  privateKey: CryptoKey | null;
  signingPrivateKey: CryptoKey | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  setSession(token: string, user: UserResponse, privateKey: CryptoKey, signingPrivateKey?: CryptoKey | null): void;
  updateUser(user: UserResponse): void;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    privateKey: null,
    signingPrivateKey: null,
    isLoading: true,
  });

  // On mount: restore JWT from localStorage + reload profile, and restore the
  // private key from sessionStorage (survives reloads/redirects within the tab).
  useEffect(() => {
    const token = loadToken();
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fin de chargement (pas de session)
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    (async () => {
      try {
        const profile = await api.getProfile(token);
        const user = await api.getUser(profile.id, token);
        let privateKey: CryptoKey | null = null;
        let signingPrivateKey: CryptoKey | null = null;
        const stored = loadPrivateKey();
        if (stored) {
          try {
            privateKey = await importPrivateKey(fromBase64(stored));
          } catch {
            clearPrivateKey(); // clé corrompue/illisible → on repart proprement
          }
        }
        const storedSign = loadSigningPrivateKey();
        if (storedSign) {
          try {
            signingPrivateKey = await importSigningPrivateKey(fromBase64(storedSign));
          } catch {
            clearSigningPrivateKey();
          }
        }
        setState({ token, user, privateKey, signingPrivateKey, isLoading: false });
      } catch {
        clearToken();
        clearPrivateKey();
        clearSigningPrivateKey();
        setState({ token: null, user: null, privateKey: null, signingPrivateKey: null, isLoading: false });
      }
    })();
  }, []);

  const setSession = useCallback((token: string, user: UserResponse, privateKey: CryptoKey, signingPrivateKey?: CryptoKey | null) => {
    saveToken(token);
    setState({ token, user, privateKey, signingPrivateKey: signingPrivateKey ?? null, isLoading: false });
    // Persiste la clé pour la durée de l'onglet (fire-and-forget).
    exportPrivateKeyBytes(privateKey)
      .then((buf) => savePrivateKey(toBase64(buf)))
      .catch(() => {});
    if (signingPrivateKey) {
      exportSigningPrivateKeyBytes(signingPrivateKey)
        .then((buf) => saveSigningPrivateKey(toBase64(buf)))
        .catch(() => {});
    } else {
      clearSigningPrivateKey();
    }
  }, []);

  const updateUser = useCallback((user: UserResponse) => {
    setState((s) => ({ ...s, user }));
  }, []);

  const logout = useCallback(() => {
    clearToken();
    clearPrivateKey();
    clearSigningPrivateKey();
    setState({ token: null, user: null, privateKey: null, signingPrivateKey: null, isLoading: false });
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
