'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as api from '@/lib/api';
import {
  createInitialTree,
  deriveMasterKeys,
  deriveRecoveryKey,
  encryptPrivateKey,
  encryptSigningPrivateKey,
  encryptTEK,
  exportPublicKey,
  exportSigningPublicKey,
  generateKeyPair,
  generateRecoveryCode,
  generateSalt,
  generateSigningKeyPair,
  generateTEK,
  toBase64,
} from '@/lib/crypto';
import { saveSalts } from '@/lib/storage';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Step = 'form' | 'generating' | 'recovery';

export default function RegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
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
      // ── Key generation (all client-side) ────────────────────────────────
      const salt_mp = generateSalt();
      const salt_rc = generateSalt();
      const rc = generateRecoveryCode();

      const { kek: kek1, authHash } = await deriveMasterKeys(password, salt_mp);
      const kek2 = await deriveRecoveryKey(rc, salt_rc);

      const keyPair = await generateKeyPair();
      const pub_key = await exportPublicKey(keyPair.publicKey);
      const priv_key_enc_1 = await encryptPrivateKey(keyPair.privateKey, kek1);
      const priv_key_enc_2 = await encryptPrivateKey(keyPair.privateKey, kek2);
      const signingKeyPair = await generateSigningKeyPair();
      const sign_pub_key = await exportSigningPublicKey(signingKeyPair.publicKey);
      const sign_priv_key_enc_1 = await encryptSigningPrivateKey(signingKeyPair.privateKey, kek1);
      const sign_priv_key_enc_2 = await encryptSigningPrivateKey(signingKeyPair.privateKey, kek2);

      const tek = await generateTEK();
      const tree_enc_key = await encryptTEK(tek, keyPair.publicKey);
      // Initial encrypted tree — not sent to the server in this payload (stored separately if needed)
      await createInitialTree(tek);

      const salt_mp_b64 = toBase64(salt_mp);
      const salt_rc_b64 = toBase64(salt_rc);

      await api.createUser({
        email: email.trim(),
        username: username.trim(),
        auth_hash: authHash,
        salt_mp: salt_mp_b64,
        salt_rc: salt_rc_b64,
        pub_key,
        priv_key_enc_1,
        priv_key_enc_2,
        sign_pub_key,
        sign_priv_key_enc_1,
        sign_priv_key_enc_2,
        tree_enc_key,
      });

      // Persist salts locally so the user can log in from this device
      saveSalts(username.trim(), { salt_mp: salt_mp_b64, salt_rc: salt_rc_b64 });

      setRecoveryCode(rc);
      setStep('recovery');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création du compte.');
      setStep('form');
    } finally {
      setIsLoading(false);
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
            Cette clé s'affiche <strong>une seule fois</strong>. Si vous perdez votre mot de passe maître sans elle,
            votre compte est irrécupérable.
          </Alert>
          <div className="mb-4 rounded-lg border border-slate-600 bg-slate-900 p-4">
            <p className="font-mono text-sm tracking-widest text-emerald-300 break-all">{recoveryCode}</p>
          </div>
          <div className="mb-5 flex items-start gap-2">
            <input
              id="recovery-confirm"
              type="checkbox"
              checked={recoveryConfirmed}
              onChange={(e) => setRecoveryConfirmed(e.target.checked)}
              className="mt-1 accent-emerald-500"
            />
            <label htmlFor="recovery-confirm" className="text-sm text-slate-300 cursor-pointer">
              J'ai copié et sauvegardé cette clé en lieu sûr.
            </label>
          </div>
          <Button
            onClick={() => router.push('/login')}
            disabled={!recoveryConfirmed}
            className="w-full"
          >
            Accéder à la connexion
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-100">Créer un compte</h1>
        <p className="mt-1 text-sm text-slate-400">Zero Knowledge — les clés sont générées sur votre appareil.</p>
      </div>

      <form
        onSubmit={handleRegister}
        className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-800/50 p-6"
      >
        {error && <Alert variant="error">{error}</Alert>}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />

        <Input
          label="Identifiant"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <Input
          label="Mot de passe maître"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          hint="Minimum 12 caractères. Votre seul rempart — choisissez-le fort."
        />

        <Input
          label="Confirmer le mot de passe"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          error={confirm && confirm !== password ? 'Les mots de passe ne correspondent pas.' : undefined}
        />

        <Button type="submit" isLoading={isLoading} className="w-full">
          {isLoading ? 'Génération des clés…' : 'Créer mon compte'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-500">
        Déjà inscrit ?{' '}
        <Link href="/login" className="text-emerald-400 hover:text-emerald-300">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
