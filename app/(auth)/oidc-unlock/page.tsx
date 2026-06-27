'use client';

// Reached after a successful OIDC login when the account already exists.
// The backend issued a short-lived pending JWT; this page uses a RSA-OAEP
// challenge-response to prove the user holds the private key (i.e. knows their
// master password) before the backend will issue a real session JWT.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth';
import * as api from '@/lib/api';
import { decryptPrivateKey, deriveMasterKeys, fromBase64, toBase64 } from '@/lib/crypto';
import { loadSalts } from '@/lib/storage';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const PENDING_OIDC_TOKEN_KEY = 'blind_pending_oidc_token';

type Step = 'password' | 'totp';

interface ChallengeData {
  nonce_token: string;
  encrypted_challenge: string;
  priv_key_enc_1: string;
}

// Decode JWT payload without verifying (the backend will verify on /oidc/verify).
function jwtPayload<T>(token: string): T {
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64)) as T;
}

function parsePendingOidcToken(): { token: string; username: string } | null {
  if (typeof window === 'undefined') return null;
  const stored = sessionStorage.getItem(PENDING_OIDC_TOKEN_KEY);
  if (!stored) return null;
  try {
    const p = jwtPayload<{ oidcPending: boolean; username: string }>(stored);
    return p.oidcPending ? { token: stored, username: p.username } : null;
  } catch {
    return null;
  }
}

export default function OidcUnlockPage() {
  const router = useRouter();
  const { setSession } = useAuth();

  const [initData] = useState(parsePendingOidcToken);
  const pendingToken = initData?.token ?? null;
  const username = initData?.username ?? '';
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [step, setStep] = useState<Step>('password');

  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [pendingPrivateKey, setPendingPrivateKey] = useState<CryptoKey | null>(null);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 1. Validate pending token and fetch challenge
  useEffect(() => {
    if (!pendingToken) {
      sessionStorage.removeItem(PENDING_OIDC_TOKEN_KEY);
      router.replace('/login');
      return;
    }

    api.getOidcChallenge(pendingToken)
      .then(setChallenge)
      .catch(() => {
        sessionStorage.removeItem(PENDING_OIDC_TOKEN_KEY);
        router.replace('/login');
      });
  }, [router, pendingToken]);

  // 2. User enters master password → decrypt private key → decrypt challenge → verify
  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingToken || !challenge) return;

    const salts = loadSalts(username);
    if (!salts) {
      setError("Aucun salt trouvé sur cet appareil pour ce compte. Utilisez l'appareil sur lequel vous vous êtes inscrit.");
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const saltBytes = new Uint8Array(fromBase64(salts.salt_mp)) as Uint8Array<ArrayBuffer>;
      const { kek } = await deriveMasterKeys(password, saltBytes);

      const privateKey = await decryptPrivateKey(challenge.priv_key_enc_1, kek);

      const encryptedBytes = new Uint8Array(fromBase64(challenge.encrypted_challenge));
      const decryptedBuffer = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encryptedBytes);
      const plaintext = toBase64(decryptedBuffer);

      const result = await api.verifyOidcChallenge(challenge.nonce_token, plaintext);

      if ('totp_required' in result) {
        setTotpToken(result.totp_token);
        setPendingPrivateKey(privateKey);
        setStep('totp');
        setIsLoading(false);
        return;
      }

      await finaliseSession(result.access_token, privateKey);
    } catch (err) {
      setIsLoading(false);
      const msg = err instanceof Error ? err.message : '';
      setError(
        msg.includes('Défi RSA') || msg.includes('operation-specific') || msg.includes('decrypt')
          ? 'Mot de passe incorrect.'
          : (msg || 'Erreur de déchiffrement.'),
      );
    }
  }

  // 3. (optional) TOTP step
  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingPrivateKey) return;

    setIsLoading(true);
    setError('');
    try {
      const result = await api.totpVerify(totpToken, totpCode);
      await finaliseSession(result.access_token, pendingPrivateKey);
    } catch (err) {
      setIsLoading(false);
      const msg = err instanceof Error ? err.message : '';
      setError(msg || 'Code TOTP incorrect.');
    }
  }

  async function finaliseSession(accessToken: string, privateKey: CryptoKey) {
    const { sub } = jwtPayload<{ sub: string }>(accessToken);
    const user = await api.getUser(sub, accessToken);
    sessionStorage.removeItem(PENDING_OIDC_TOKEN_KEY);
    setSession(accessToken, user, privateKey);
    router.replace('/dashboard');
  }

  if (!challenge) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-500" />
        <p className="text-sm text-slate-400">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-100">
          {step === 'totp' ? 'Double facteur' : 'Déverrouiller'}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {step === 'totp' ? (
            <>Entrez le code de votre application d&apos;authentification.</>
          ) : (
            <>
              Connecté via OIDC en tant que{' '}
              <span className="font-medium text-slate-200">{username}</span>.
              <br />
              Entrez votre mot de passe maître pour déchiffrer votre clé privée.
            </>
          )}
        </p>
      </div>

      {step === 'password' ? (
        <form
          onSubmit={handlePassword}
          className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-800/50 p-6"
        >
          {error && <Alert variant="error">{error}</Alert>}
          <Input
            label="Mot de passe maître"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
          <Button type="submit" isLoading={isLoading} className="w-full">
            {isLoading ? 'Vérification…' : 'Déverrouiller'}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={handleTotp}
          className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-800/50 p-6"
        >
          {error && <Alert variant="error">{error}</Alert>}
          <Input
            label="Code TOTP"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
          />
          <Button type="submit" isLoading={isLoading} className="w-full">
            {isLoading ? 'Vérification…' : 'Confirmer'}
          </Button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-slate-500">
        <a
          href="/login"
          className="text-emerald-400 hover:text-emerald-300"
          onClick={() => sessionStorage.removeItem(PENDING_OIDC_TOKEN_KEY)}
        >
          Se connecter autrement
        </a>
      </p>
    </div>
  );
}
