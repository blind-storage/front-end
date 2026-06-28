'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth';
import * as api from '@/lib/api';
import type { BlindCertificate } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function KeysPage() {
  const { user, privateKey } = useAuth();
  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Mes clés</h1>
        <p className="mt-1 text-sm text-slate-400">Informations sur votre paire de clés cryptographiques.</p>
      </div>

      <CertificateCard user={user} />
      <PublicKeyCard pubKey={user.pub_key} />
      <PrivateKeyCard privateKey={privateKey} />
    </div>
  );
}

// ── Certificat ────────────────────────────────────────────────────────────────

type VerifyState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'verified' }
  | { status: 'revoked'; reason: string }
  | { status: 'invalid'; reason: string }
  | { status: 'legacy' }
  | { status: 'none' }
  | { status: 'error'; reason: string };

function isBlindCertificate(v: unknown): v is BlindCertificate {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as BlindCertificate).version === 1 &&
    typeof (v as BlindCertificate).fingerprint === 'string' &&
    typeof (v as BlindCertificate).issued_at === 'string'
  );
}

function CertificateCard({ user }: { user: api.UserResponse }) {
  const cert = isBlindCertificate(user.key_certificate) ? user.key_certificate : null;
  const signature = user.key_certificate_signature ?? null;
  const fingerprint = user.key_fingerprint ?? null;

  const [verifyState, setVerifyState] = useState<VerifyState>(() => {
    if (cert && signature) return { status: 'loading' };
    return user.key_certificate ? { status: 'legacy' } : { status: 'none' };
  });

  useEffect(() => {
    if (!cert || !signature) return;
    let cancelled = false;

    (async () => {
      try {
        const [caRes, crlRes] = await Promise.all([api.getCaCert(), api.getCrl()]);
        const { verifyUserCertificate } = await import('@/lib/pki');
        const result = await verifyUserCertificate(cert, signature, caRes.pub_key, crlRes.crl);
        if (cancelled) return;
        if (result.trusted) {
          setVerifyState({ status: 'verified' });
        } else if (result.reason === 'Certificat révoqué') {
          setVerifyState({ status: 'revoked', reason: result.reason });
        } else {
          setVerifyState({ status: 'invalid', reason: result.reason });
        }
      } catch (e) {
        if (cancelled) return;
        setVerifyState({ status: 'error', reason: e instanceof Error ? e.message : 'Erreur inconnue' });
      }
    })();
    return () => { cancelled = true; };
  }, [cert, signature]);

  return (
    <Card title="Certificat de clé publique" description="Émis par la CA Blind Storage — garantit l'authenticité de votre clé publique.">
      <div className="space-y-4">
        <StatusBadge state={verifyState} />

        {cert ? (
          <dl className="space-y-2 text-xs">
            <Row label="Sujet" value={`${cert.subject.username} — ${cert.subject.email}`} />
            <Row label="Empreinte (SHA-256)" value={fingerprint ? fingerprint.match(/.{1,8}/g)?.join(' ') ?? fingerprint : '—'} mono />
            <Row label="Émis le" value={new Date(cert.issued_at).toLocaleString('fr-FR')} />
            <Row label="Expire le" value={new Date(cert.expires_at).toLocaleString('fr-FR')} />
            <Row label="Algorithme CA" value="ECDSA P-256 / SHA-256" />
          </dl>
        ) : (
          <p className="text-xs text-slate-500">
            {verifyState.status === 'none'
              ? 'Aucun certificat associé à ce compte.'
              : 'Format de certificat hérité (HMAC) — non vérifiable par la CA asymétrique.'}
          </p>
        )}
      </div>
    </Card>
  );
}

function StatusBadge({ state }: { state: VerifyState }) {
  const configs: Record<VerifyState['status'], { label: string; classes: string }> = {
    idle:     { label: 'Non vérifié',   classes: 'bg-slate-700 text-slate-400' },
    loading:  { label: 'Vérification…', classes: 'bg-slate-700 text-slate-400 animate-pulse' },
    verified: { label: 'Vérifié CA',    classes: 'bg-emerald-500/15 text-emerald-400' },
    revoked:  { label: 'Révoqué',       classes: 'bg-red-500/15 text-red-400' },
    invalid:  { label: 'Signature invalide', classes: 'bg-red-500/15 text-red-400' },
    legacy:   { label: 'Hérité (HMAC)', classes: 'bg-amber-500/15 text-amber-400' },
    none:     { label: 'Absent',        classes: 'bg-slate-700 text-slate-400' },
    error:    { label: 'Erreur',        classes: 'bg-red-500/15 text-red-400' },
  };
  const c = configs[state.status];
  const detail = 'reason' in state ? state.reason : undefined;

  return (
    <div className="flex items-center gap-3">
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${c.classes}`}>{c.label}</span>
      {detail && <span className="text-xs text-slate-500">{detail}</span>}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3 rounded-lg bg-slate-900/50 px-3 py-2">
      <dt className="w-40 shrink-0 text-slate-400 font-medium">{label}</dt>
      <dd className={`break-all text-slate-300 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

// ── Clé publique ──────────────────────────────────────────────────────────────

function PublicKeyCard({ pubKey }: { pubKey: string }) {
  const [show, setShow] = useState(false);
  const [fingerprint, setFingerprint] = useState('');
  const [copied, setCopied] = useState(false);

  async function computeFingerprint() {
    if (fingerprint) return;
    try {
      const { importPublicKey } = await import('@/lib/crypto');
      const key = await importPublicKey(pubKey);
      const raw = await crypto.subtle.exportKey('spki', key);
      const hash = await crypto.subtle.digest('SHA-256', raw);
      const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
      setFingerprint(hex.match(/.{1,4}/g)?.join(':') ?? hex);
    } catch {
      setFingerprint('—');
    }
  }

  function handleToggle() {
    setShow((v) => !v);
    if (!show) computeFingerprint();
  }

  return (
    <Card title="Clé publique (RSA-OAEP 2048)" description="Partagée avec le serveur pour le chiffrement des clés de fichiers (FEK).">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">Utilisée pour chiffrer les clés de fichiers partagés avec vous.</p>
          <Button variant="ghost" className="text-xs" onClick={handleToggle}>
            {show ? 'Masquer' : 'Afficher'}
          </Button>
        </div>

        {show && (
          <div className="rounded-lg bg-slate-900 p-4 space-y-3">
            {fingerprint && (
              <div>
                <p className="text-xs font-medium text-slate-400 mb-1">Empreinte SHA-256</p>
                <p className="font-mono text-xs text-slate-300 break-all">{fingerprint}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Clé complète</p>
              <p className="font-mono text-xs text-slate-500 break-all leading-relaxed">{pubKey}</p>
            </div>
            <button
              type="button"
              className="text-xs text-emerald-400 hover:text-emerald-300"
              onClick={() => { navigator.clipboard.writeText(pubKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            >
              {copied ? '✓ Copiée' : 'Copier la clé'}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Clé privée ────────────────────────────────────────────────────────────────

function PrivateKeyCard({ privateKey }: { privateKey: CryptoKey | null }) {
  return (
    <Card title="Clé privée" description="Jamais transmise au serveur — déchiffrée localement à partir de votre mot de passe maître.">
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-200">État en mémoire</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {privateKey
                ? 'Déchiffrée et disponible pour les opérations cryptographiques.'
                : 'Non chargée — reconnectez-vous avec votre mot de passe pour la déchiffrer.'}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${privateKey ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
            {privateKey ? 'Active' : 'Absente'}
          </span>
        </div>

        <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 py-3 space-y-2 text-xs text-slate-500">
          <p><span className="text-slate-400 font-medium">Algorithme :</span> RSA-OAEP 2048 bits</p>
          <p><span className="text-slate-400 font-medium">Chiffrement au repos :</span> AES-GCM 256 bits (KEK dérivée du mot de passe maître)</p>
          <p><span className="text-slate-400 font-medium">Dérivation KEK :</span> PBKDF2 — SHA-256, 600 000 itérations</p>
          <p><span className="text-slate-400 font-medium">Persistance :</span> Jamais — déchiffrée uniquement en mémoire à la connexion</p>
        </div>
      </div>
    </Card>
  );
}
