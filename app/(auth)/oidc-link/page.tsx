'use client';

// Reached after OIDC callback when the provider email matches an existing local account.
// Step 1: username + master password → may require TOTP (step 2).
// Step 2 (if TOTP enabled): verify code via POST /auth/oidc/link-confirm-totp.

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/context/auth';
import * as api from '@/lib/api';
import { decryptPrivateKey, decryptSigningPrivateKey, deriveMasterKeys, fromBase64 } from '@/lib/crypto';
import { loadSalts } from '@/lib/storage';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function OidcLinkForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession } = useAuth();

  const linkToken = params.get('link_token') ?? '';
  const email = params.get('email') ?? '';

  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingTotpToken, setPendingTotpToken] = useState('');
  const [pendingKek, setPendingKek] = useState<CryptoKey | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!linkToken) {
    return (
      <Alert variant="error">
        Token de liaison manquant. Recommencez le flux OIDC.
      </Alert>
    );
  }

  async function finishSession(access_token: string, kek: CryptoKey) {
    const profile = await api.getProfile(access_token);
    const user = await api.getUser(profile.id, access_token);
    if (!user.priv_key_enc_1) throw new Error('Clé privée introuvable sur le serveur.');
    const privateKey = await decryptPrivateKey(user.priv_key_enc_1, kek);
    const signingPrivateKey = user.sign_priv_key_enc_1
      ? await decryptSigningPrivateKey(user.sign_priv_key_enc_1, kek)
      : null;
    setSession(access_token, user, privateKey, signingPrivateKey);
    router.push('/dashboard');
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const salts = loadSalts(username.trim());
    if (!salts) {
      setError("Aucun salt trouvé sur cet appareil pour cet identifiant. Utilisez l'appareil sur lequel vous vous êtes inscrit.");
      return;
    }

    setIsLoading(true);
    try {
      const saltBytes = new Uint8Array(fromBase64(salts.salt_mp)) as Uint8Array<ArrayBuffer>;
      const { kek, authHash } = await deriveMasterKeys(password, saltBytes);

      const result = await api.oidcLinkConfirm(linkToken, authHash);

      if ('totp_required' in result) {
        setPendingTotpToken(result.totp_token);
        setPendingKek(kek);
        setStep('totp');
        return;
      }

      await finishSession(result.access_token, kek);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de liaison.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { access_token } = await api.oidcLinkConfirmTotp(pendingTotpToken, totpCode);
      await finishSession(access_token, pendingKek!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code TOTP invalide.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-100">Lier votre compte</h1>
        <p className="mt-1 text-sm text-slate-400">
          Un compte local existe pour <span className="text-slate-200">{email}</span>.<br />
          Confirmez votre identité pour lier ce fournisseur.
        </p>
      </div>

      {step === 'credentials' && (
        <form
          onSubmit={handleCredentials}
          className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-800/50 p-6"
        >
          {error && <Alert variant="error">{error}</Alert>}

          <Alert variant="info">
            Entrez vos identifiants locaux pour autoriser la liaison.
          </Alert>

          <Input
            label="Identifiant local"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Mot de passe maître"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button type="submit" isLoading={isLoading} className="w-full">
            {isLoading ? 'Vérification…' : 'Confirmer la liaison'}
          </Button>
        </form>
      )}

      {step === 'totp' && (
        <form
          onSubmit={handleTotp}
          className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-800/50 p-6"
        >
          {error && <Alert variant="error">{error}</Alert>}

          <Alert variant="info">
            Votre compte a le double facteur activé. Entrez le code de votre application d'authentification.
          </Alert>

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
            {isLoading ? 'Vérification…' : 'Valider'}
          </Button>

          <button
            type="button"
            className="w-full text-center text-xs text-slate-500 hover:text-slate-300"
            onClick={() => { setStep('credentials'); setError(''); }}
          >
            Retour
          </button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-slate-500">
        <a href="/login" className="text-emerald-400 hover:text-emerald-300">
          Annuler
        </a>
      </p>
    </div>
  );
}

export default function OidcLinkPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center gap-2 text-slate-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-500" />
        Chargement…
      </div>
    }>
      <OidcLinkForm />
    </Suspense>
  );
}
