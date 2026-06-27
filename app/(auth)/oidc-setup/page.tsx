'use client';

// Reached after OIDC callback when the email has no existing account.
// The user chooses a username and master password; all crypto is generated here.
// Calls POST /auth/oidc/setup with the setup_token + cryptographic material.

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/context/auth';
import * as api from '@/lib/api';
import {
  createInitialTree,
  decryptPrivateKey,
  deriveMasterKeys,
  deriveRecoveryKey,
  encryptPrivateKey,
  encryptTEK,
  exportPublicKey,
  generateKeyPair,
  generateRecoveryCode,
  generateSalt,
  generateTEK,
  toBase64,
} from '@/lib/crypto';
import { saveSalts } from '@/lib/storage';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Step = 'form' | 'generating' | 'recovery';

function OidcSetupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession } = useAuth();

  const setupToken = params.get('setup_token') ?? '';
  const email = params.get('email') ?? '';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [savedToken, setSavedToken] = useState('');
  // Retain the KEK and encrypted private key to avoid re-deriving in handleContinue
  const [savedKek, setSavedKek] = useState<CryptoKey | null>(null);
  const [savedPrivKeyEnc, setSavedPrivKeyEnc] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!setupToken) {
    return (
      <Alert variant="error">
        Token de configuration manquant. Recommencez le flux OIDC.
      </Alert>
    );
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 12) {
      setError('Le mot de passe maître doit contenir au moins 12 caractères.');
      return;
    }

    setIsLoading(true);
    setStep('generating');

    try {
      const salt_mp = generateSalt();
      const salt_rc = generateSalt();
      const rc = generateRecoveryCode();

      const { kek: kek1, authHash } = await deriveMasterKeys(password, salt_mp);
      const kek2 = await deriveRecoveryKey(rc, salt_rc);

      const keyPair = await generateKeyPair();
      const pub_key = await exportPublicKey(keyPair.publicKey);
      const priv_key_enc_1 = await encryptPrivateKey(keyPair.privateKey, kek1);
      const priv_key_enc_2 = await encryptPrivateKey(keyPair.privateKey, kek2);

      const tek = await generateTEK();
      const tree_enc_key = await encryptTEK(tek, keyPair.publicKey);
      await createInitialTree(tek);

      const salt_mp_b64 = toBase64(salt_mp);
      const salt_rc_b64 = toBase64(salt_rc);

      const { access_token } = await api.oidcSetup({
        setup_token: setupToken,
        username: username.trim(),
        auth_hash: authHash,
        pub_key,
        priv_key_enc_1,
        priv_key_enc_2,
        salt_mp: salt_mp_b64,
        salt_rc: salt_rc_b64,
        tree_enc_key,
      });

      saveSalts(username.trim(), { salt_mp: salt_mp_b64, salt_rc: salt_rc_b64 });
      setSavedToken(access_token);
      setSavedKek(kek1);
      setSavedPrivKeyEnc(priv_key_enc_1);
      setRecoveryCode(rc);
      setStep('recovery');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création du compte.');
      setStep('form');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleContinue() {
    try {
      if (!savedKek) throw new Error('KEK absent');
      const profile = await api.getProfile(savedToken);
      const user = await api.getUser(profile.id, savedToken);
      const privateKey = await decryptPrivateKey(savedPrivKeyEnc, savedKek);
      setSession(savedToken, user, privateKey);
      router.push('/dashboard');
    } catch {
      router.push('/dashboard');
    }
  }

  if (step === 'generating') {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-8">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-500" />
          <p className="text-sm text-slate-300">Génération des clés cryptographiques…</p>
          <p className="mt-1 text-xs text-slate-500">PBKDF2 · RSA-OAEP · AES-GCM</p>
        </div>
      </div>
    );
  }

  if (step === 'recovery') {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-amber-500/40 bg-slate-800/50 p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-amber-400 text-xl">⚠</span>
            <h2 className="text-base font-semibold text-slate-100">Sauvegardez votre clé de recouvrement</h2>
          </div>
          <Alert variant="warning" className="mb-4">
            Cette clé s'affiche <strong>une seule fois</strong>. Sans elle, vous ne pourrez pas récupérer votre compte.
          </Alert>
          <div className="mb-4 rounded-lg border border-slate-600 bg-slate-900 p-4">
            <p className="font-mono text-sm tracking-widest text-emerald-300 break-all">{recoveryCode}</p>
          </div>
          <div className="mb-5 flex items-start gap-2">
            <input
              id="confirm-rc"
              type="checkbox"
              checked={recoveryConfirmed}
              onChange={(e) => setRecoveryConfirmed(e.target.checked)}
              className="mt-1 accent-emerald-500"
            />
            <label htmlFor="confirm-rc" className="text-sm text-slate-300 cursor-pointer">
              J'ai copié et sauvegardé cette clé en lieu sûr.
            </label>
          </div>
          <Button onClick={handleContinue} disabled={!recoveryConfirmed} className="w-full">
            Accéder au tableau de bord
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-100">Finaliser votre compte</h1>
        <p className="mt-1 text-sm text-slate-400">
          Connecté via OIDC avec <span className="text-slate-200">{email}</span>.
        </p>
      </div>

      <form
        onSubmit={handleSetup}
        className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-800/50 p-6"
      >
        {error && <Alert variant="error">{error}</Alert>}

        <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2.5">
          <p className="text-xs text-slate-500 mb-0.5">Email (fourni par le fournisseur)</p>
          <p className="text-sm text-slate-200">{email}</p>
        </div>

        <Input
          label="Identifiant"
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          hint="Minimum 12 caractères. Protège votre clé privée."
        />

        <Input
          label="Confirmer le mot de passe"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          error={confirm && confirm !== password ? 'Ne correspond pas.' : undefined}
        />

        <Button type="submit" isLoading={isLoading} className="w-full">
          {isLoading ? 'Génération des clés…' : 'Créer mon compte'}
        </Button>
      </form>
    </div>
  );
}

export default function OidcSetupPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center gap-2 text-slate-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-500" />
        Chargement…
      </div>
    }>
      <OidcSetupForm />
    </Suspense>
  );
}
