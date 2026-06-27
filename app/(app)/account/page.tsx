'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth';
import * as api from '@/lib/api';
import QRCode from 'qrcode';
import {
  decryptPrivateKey,
  deriveMasterKeys,
  encryptPrivateKey,
  fromBase64,
  toBase64,
} from '@/lib/crypto';
import { loadSalts, saveSalts } from '@/lib/storage';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

function AccountPageContent() {
  const { user, token, updateUser } = useAuth();
  const params = useSearchParams();
  const justLinked = params.get('linked') === '1';

  if (!user || !token) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Mon compte</h1>
        <p className="mt-1 text-sm text-slate-400">Profil, sécurité et services liés.</p>
      </div>

      {justLinked && <Alert variant="success">Provider lié avec succès.</Alert>}

      <ProfileForm user={user} token={token} onUpdate={updateUser} />
      <LinkedProviders userId={user.id} token={token} />
      <ChangePasswordSection />
      <TotpSection />
      <DangerZone userId={user.id} token={token} />
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense>
      <AccountPageContent />
    </Suspense>
  );
}

// ── Profil ────────────────────────────────────────────────────────────────────

function ProfileForm({
  user,
  token,
  onUpdate,
}: {
  user: api.UserResponse;
  token: string;
  onUpdate: (u: api.UserResponse) => void;
}) {
  const [email, setEmail] = useState(user.email);
  const [username, setUsername] = useState(user.username);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage('');
    try {
      const updated = await api.updateUser(user.id, token, {
        email: email.trim(),
        username: username.trim(),
      });
      onUpdate(updated);
      setStatus('ok');
      setMessage('Profil mis à jour.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  return (
    <Card title="Profil" description="Email et identifiant affichés aux autres utilisateurs.">
      <form onSubmit={handleSave} className="space-y-4">
        {status === 'ok' && <Alert variant="success">{message}</Alert>}
        {status === 'error' && <Alert variant="error">{message}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Identifiant" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>

        <div className="flex items-center justify-between border-t border-slate-700 pt-4">
          <p className="text-xs text-slate-500">
            Rôle : <span className="text-slate-300">{user.role}</span>
          </p>
          <Button type="submit" isLoading={status === 'loading'}>Enregistrer</Button>
        </div>
      </form>
    </Card>
  );
}

// ── Comptes liés ──────────────────────────────────────────────────────────────

const PROVIDERS: { key: string; label: string }[] = [
  { key: 'GOOGLE', label: 'Google' },
  { key: 'REZEL', label: 'Rezel' },
  { key: 'DROPBOX', label: 'Dropbox' },
];

function LinkedProviders({ userId, token }: { userId: string; token: string }) {
  const [connections, setConnections] = useState<api.OidcConnectionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getOidcConnections(userId, token)
      .then(setConnections)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, token]);

  async function handleUnlink(providerKey: string) {
    setUnlinking(providerKey);
    setError('');
    try {
      await api.deleteOidcConnection(userId, token, providerKey);
      setConnections((prev) => prev.filter((c) => c.provider !== providerKey));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la déconnexion.');
    } finally {
      setUnlinking(null);
    }
  }

  const linked = new Set(connections.map((c) => c.provider));

  return (
    <Card title="Comptes liés" description="Connectez-vous avec un provider tiers.">
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      {loading ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : (
        <ul className="divide-y divide-slate-700">
          {PROVIDERS.map(({ key, label }) => {
            const conn = connections.find((c) => c.provider === key);
            return (
              <li key={key} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-200">{label}</p>
                  {conn && <p className="text-xs text-slate-400">{conn.email ?? 'Lié'}</p>}
                </div>
                {linked.has(key) ? (
                  <Button variant="danger" className="px-3 py-1.5 text-xs" isLoading={unlinking === key} onClick={() => handleUnlink(key)}>
                    Délier
                  </Button>
                ) : (
                  <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => { window.location.href = api.oidcLoginUrl(key.toLowerCase() as 'google' | 'rezel' | 'dropbox'); }}>
                    Lier
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── Mot de passe maître ───────────────────────────────────────────────────────

function ChangePasswordSection() {
  const { user, token, privateKey, setSession } = useAuth();
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    if (newPwd !== confirmPwd) { setStatus('error'); setMessage('Les nouveaux mots de passe ne correspondent pas.'); return; }
    if (newPwd.length < 12) { setStatus('error'); setMessage('Le mot de passe maître doit contenir au moins 12 caractères.'); return; }
    if (!user || !token) return;

    const salts = loadSalts(user.username);
    if (!salts) { setStatus('error'); setMessage('Salts introuvables sur cet appareil.'); return; }

    setStatus('loading');
    try {
      const oldSaltBytes = new Uint8Array(fromBase64(salts.salt_mp));
      const { kek: oldKek } = await deriveMasterKeys(oldPwd, oldSaltBytes);

      let resolvedPrivKey = privateKey;
      if (!resolvedPrivKey) {
        if (!user.priv_key_enc_1) throw new Error('Clé privée introuvable sur le serveur.');
        resolvedPrivKey = await decryptPrivateKey(user.priv_key_enc_1, oldKek);
      } else if (user.priv_key_enc_1) {
        await decryptPrivateKey(user.priv_key_enc_1, oldKek);
      }

      const { generateSalt } = await import('@/lib/crypto');
      const newSaltBytes = generateSalt();
      const { kek: newKek, authHash: newAuthHash } = await deriveMasterKeys(newPwd, newSaltBytes);
      const newPrivKeyEnc = await encryptPrivateKey(resolvedPrivKey!, newKek);
      const newSaltB64 = toBase64(newSaltBytes);

      await api.changePassword(token, { auth_hash: newAuthHash, priv_key_enc_1: newPrivKeyEnc, salt_mp: newSaltB64 });
      saveSalts(user.username, { salt_mp: newSaltB64, salt_rc: salts.salt_rc });
      setSession(token, { ...user, priv_key_enc_1: newPrivKeyEnc, salt_mp: newSaltB64 }, resolvedPrivKey!);
      setStatus('ok');
      setMessage('Mot de passe maître mis à jour.');
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? (err.message.includes('operation-specific') ? 'Ancien mot de passe incorrect.' : err.message) : 'Erreur.');
    }
  }

  return (
    <Card title="Mot de passe maître" description="Le re-chiffrement de la clé privée est effectué entièrement sur cet appareil.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {status === 'ok' && <Alert variant="success">{message}</Alert>}
        {status === 'error' && <Alert variant="error">{message}</Alert>}

        <Input label="Ancien mot de passe maître" type="password" autoComplete="current-password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nouveau mot de passe maître" type="password" autoComplete="new-password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required hint="Minimum 12 caractères." />
          <Input label="Confirmer" type="password" autoComplete="new-password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} required error={confirmPwd && confirmPwd !== newPwd ? 'Ne correspond pas.' : undefined} />
        </div>

        <div className="flex justify-end border-t border-slate-700 pt-4">
          <Button type="submit" isLoading={status === 'loading'}>
            {status === 'loading' ? 'Dérivation & re-chiffrement…' : 'Changer le mot de passe'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ── TOTP ──────────────────────────────────────────────────────────────────────

function generateTotpSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => chars[b % 32]).join('');
}

function totpUri(secret: string, username: string): string {
  return `otpauth://totp/BlindStorage:${encodeURIComponent(username)}?secret=${secret}&issuer=BlindStorage&algorithm=SHA1&digits=6&period=30`;
}

function TotpQrCode({ uri }: { uri: string }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    QRCode.toDataURL(uri, {
      width: 200,
      margin: 2,
      color: { dark: '#f1f5f9', light: '#0f172a' },
    }).then(setDataUrl).catch(() => {});
  }, [uri]);

  if (!dataUrl) return <div className="h-[200px] w-[200px] animate-pulse rounded-lg bg-slate-800" />;
  return <img src={dataUrl} alt="QR code TOTP" className="rounded-lg" width={200} height={200} />;
}

function TotpSection() {
  const { user, token, updateUser } = useAuth();
  const [secret, setSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showManual, setShowManual] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  if (!user || !token) return null;

  function handleGenerate() {
    setSecret(generateTotpSecret()); setVerifyCode(''); setStatus('idle'); setMessage(''); setRecoveryCodes([]); setShowManual(false);
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    if (!secret || !verifyCode) return;
    setStatus('loading'); setMessage('');
    try {
      const res = await api.enableTotp(user!.id, token!, secret, verifyCode.trim());
      setRecoveryCodes(res.recovery_codes);
      updateUser(res.user);
      setStatus('ok'); setMessage('Double facteur activé.'); setVerifyCode('');
    } catch (err) { setStatus('error'); setMessage(err instanceof Error ? err.message : 'Erreur.'); }
  }

  async function handleDisable() {
    if (!confirm('Désactiver le double facteur ?')) return;
    setStatus('loading');
    try {
      await api.disableTotp(user!.id, token!);
      updateUser({ ...user!, totpEnabled: false, totp_recovery_codes_remaining: 0 });
      setStatus('idle'); setSecret(''); setRecoveryCodes([]);
    } catch (err) { setStatus('error'); setMessage(err instanceof Error ? err.message : 'Erreur.'); }
  }

  async function handleRenewCodes() {
    setStatus('loading');
    try {
      const res = await api.renewTotpCodes(user!.id, token!);
      setRecoveryCodes(res.recovery_codes);
      setStatus('ok'); setMessage('Codes de secours renouvelés.');
    } catch (err) { setStatus('error'); setMessage(err instanceof Error ? err.message : 'Erreur.'); }
  }

  const uri = secret ? totpUri(secret, user.username) : '';

  return (
    <Card title="Double facteur (TOTP)" description="Ajoute une couche de protection via une application d'authentification (Aegis, Authy, 1Password…).">
      {status === 'ok' && <Alert variant="success" className="mb-4">{message}</Alert>}
      {status === 'error' && <Alert variant="error" className="mb-4">{message}</Alert>}

      {user.totpEnabled ? (
        <div className="space-y-4">
          <Alert variant="success">Double facteur activé — {user.totp_recovery_codes_remaining ?? '?'} codes de secours restants.</Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleRenewCodes} isLoading={status === 'loading'}>Renouveler les codes de secours</Button>
            <Button variant="danger" onClick={handleDisable} isLoading={status === 'loading'}>Désactiver le 2FA</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!secret && <Button variant="secondary" onClick={handleGenerate}>Générer un secret TOTP</Button>}
          {secret && (
            <form onSubmit={handleEnable} className="space-y-4">
              <Alert variant="info">
                Scannez le QR code avec votre application (Aegis, Authy, Google Authenticator…), puis entrez le code affiché pour confirmer.
                Les codes de secours s&apos;afficheront <strong>une seule fois</strong>.
              </Alert>

              {/* QR code */}
              <div className="flex flex-col items-center gap-4 rounded-lg border border-slate-700 bg-slate-900 p-6 sm:flex-row sm:items-start">
                <TotpQrCode uri={uri} />
                <div className="flex-1 space-y-3 text-center sm:text-left">
                  <p className="text-sm font-medium text-slate-300">Impossible de scanner ?</p>
                  <Button type="button" variant="ghost" className="text-xs" onClick={() => setShowManual((v) => !v)}>
                    {showManual ? 'Masquer la clé manuelle' : 'Entrer la clé manuellement'}
                  </Button>
                  {showManual && (
                    <div className="rounded-lg bg-slate-950 px-3 py-2">
                      <p className="mb-1 text-xs text-slate-500">Clé Base32</p>
                      <p className="font-mono text-xs tracking-widest text-emerald-300 break-all">{secret}</p>
                      <button
                        type="button"
                        className="mt-2 text-xs text-emerald-400 hover:text-emerald-300"
                        onClick={() => { navigator.clipboard.writeText(secret); setCopiedSecret(true); setTimeout(() => setCopiedSecret(false), 2000); }}
                      >
                        {copiedSecret ? '✓ Copiée' : 'Copier la clé'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <Input
                label="Code de vérification"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                required
                hint="Entrez le code à 6 chiffres affiché dans votre application."
              />
              <div className="flex gap-2">
                <Button type="submit" isLoading={status === 'loading'} disabled={verifyCode.length !== 6}>Activer le 2FA</Button>
                <Button type="button" variant="ghost" onClick={() => { setSecret(''); setVerifyCode(''); }}>Annuler</Button>
              </div>
            </form>
          )}
        </div>
      )}

      {recoveryCodes.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="mb-3 text-sm font-semibold text-amber-300">Codes de secours — sauvegardez-les maintenant (affichés une seule fois)</p>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-sm text-slate-200">
            {recoveryCodes.map((code) => <span key={code} className="rounded bg-slate-900 px-2 py-1 text-center">{code}</span>)}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Zone de danger ────────────────────────────────────────────────────────────

function DangerZone({ userId, token }: { userId: string; token: string }) {
  const { logout } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (confirm !== 'SUPPRIMER') return;
    setIsLoading(true); setError('');
    try {
      await api.deleteUser(userId, token);
      logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
      setIsLoading(false);
    }
  }

  return (
    <Card title="Zone de danger" className="border-red-900/50">
      <Alert variant="warning" className="mb-4">
        La suppression du compte est <strong>irréversible</strong>. Toutes vos données chiffrées et vos clés seront effacées.
      </Alert>
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      <form onSubmit={handleDelete} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input label="Tapez SUPPRIMER pour confirmer" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="SUPPRIMER" className="sm:w-64" />
        <Button type="submit" variant="danger" isLoading={isLoading} disabled={confirm !== 'SUPPRIMER'}>Supprimer mon compte</Button>
      </form>
    </Card>
  );
}
