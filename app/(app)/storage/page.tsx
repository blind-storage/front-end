'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth';
import * as drive from '@/lib/drive';
import type { BrowseResult, DriveFile, DriveFolder, SharedDriveFile } from '@/lib/drive';
import {
  decryptFileContent,
  decryptFileKey,
  encryptFileContent,
  encryptFileKey,
  generateFileKey,
  importPublicKey,
  importSigningPublicKey,
  reencryptFileKey,
  signBytes,
  verifyBytes,
} from '@/lib/crypto';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PROVIDERS: Array<{ id: drive.CloudProvider; label: string }> = [
  { id: 'google-drive', label: 'Google Drive' },
  { id: 'dropbox', label: 'Dropbox' },
];

function providerLabel(provider: drive.CloudProvider): string {
  return PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
}

function providerIcon(provider: drive.CloudProvider, className = 'h-4 w-4') {
  return provider === 'dropbox' ? I.dropbox(className) : I.google(className);
}

// ── Icônes ──────────────────────────────────────────────────────────────────────

const I = {
  folder: (c = '') => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={c}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  ),
  file: (c = '') => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={c}>
      <path d="M14 3v4a1 1 0 001 1h4" />
      <path d="M5 3h9l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
    </svg>
  ),
  upload: (c = '') => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={c}>
      <path d="M12 16V4m0 0L7 9m5-5l5 5" /><path d="M5 19h14" />
    </svg>
  ),
  download: (c = '') => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={c}>
      <path d="M12 4v12m0 0l5-5m-5 5l-5-5" /><path d="M5 20h14" />
    </svg>
  ),
  trash: (c = '') => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={c}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  ),
  edit: (c = '') => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={c}>
      <path d="M4 20h4l10-10a2 2 0 00-3-3L5 17v3z" /><path d="M13.5 6.5l3 3" />
    </svg>
  ),
  move: (c = '') => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={c}>
      <path d="M2 9V5a2 2 0 012-2h3.9a2 2 0 011.69.9l.81 1.2a2 2 0 001.67.9H20a2 2 0 012 2v10a2 2 0 01-2 2H2" />
      <path d="M2 13h10" />
      <path d="M9 16l3-3-3-3" />
    </svg>
  ),
  share: (c = '') => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={c}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.8l6.8-4.1M8.6 13.2l6.8 4.1" />
    </svg>
  ),
  plus: (c = '') => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={c}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  google: (c = '') => (
    <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  ),
  dropbox: (c = '') => (
    <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
      <path fill="#0061FF" d="M6.15 3.6 1.5 6.57l4.65 2.97 4.65-2.97L6.15 3.6Zm11.7 0L13.2 6.57l4.65 2.97 4.65-2.97-4.65-2.97ZM1.5 12.5l4.65 2.97 4.65-2.97-4.65-2.96L1.5 12.5Zm16.35-2.96-4.65 2.96 4.65 2.97 4.65-2.97-4.65-2.96ZM6.15 16.5l5.85 3.74 5.85-3.74-4.65-2.97L12 14.3l-1.2-.77-4.65 2.97Z" />
    </svg>
  ),
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function StoragePage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-slate-800/40" />}>
      <StorageContent />
    </Suspense>
  );
}

function StorageContent() {
  const { token, user, privateKey, signingPrivateKey } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [connected, setConnected] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<drive.CloudProvider>('google-drive');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sharedReloadKey, setSharedReloadKey] = useState(0);

  // Statut du retour OAuth (?connected / ?error) — lecture one-shot des paramètres.
  useEffect(() => {
    const c = params.get('connected');
    const e = params.get('error');
    if (!c && !e) return;

    // Cas popup : on a été ouvert par la page principale (qui garde la clé privée en
    // mémoire). On la prévient puis on se ferme — aucune reconnexion nécessaire.
    if (window.opener && window.opener !== window) {
      window.opener.postMessage(
        { type: 'gdrive-connect', connected: c, error: e },
        window.location.origin,
      );
      window.close();
      return;
    }

    // Fallback (popup bloquée → redirection plein écran) : message inline.
    router.replace('/storage');
    /* eslint-disable react-hooks/set-state-in-effect -- message transitoire issu du retour OAuth */
    if (c) setNotice('Stockage connecté avec succès.');
    if (e) setError(decodeURIComponent(e));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [params, router]);

  // Statut de connexion du provider
  const refreshStatus = useCallback(async () => {
    if (!token) return;
    try {
      const status = await drive.getProvidersStatus(token);
      setConnected(status[provider].connected);
    } catch {
      setConnected(false);
    }
  }, [token, provider]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch du statut au montage
    refreshStatus();
  }, [refreshStatus]);

  // Charge le contenu du dossier courant
  const load = useCallback(
    async (fid: string | null) => {
      if (!token) return;
      setLoading(true);
      setError('');
      try {
        const res = await drive.browse(token, fid, provider);
        setData(res);
        setFolderId(fid);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement.');
      } finally {
        setLoading(false);
      }
    },
    [token, provider],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement de la racine à la connexion
    if (connected) load(null);
  }, [connected, load]);

  function selectProvider(nextProvider: drive.CloudProvider) {
    setProvider(nextProvider);
    setConnected(null);
    setData(null);
    setFolderId(null);
  }

  if (!token || !user) return null;

  // ── Connexion Google Drive (popup → la page principale garde la clé en mémoire) ──
  async function handleConnect() {
    setError('');
    try {
      const { url } = await drive.getConnectUrl(token!, provider);

      const w = 500, h = 680;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(url, 'gdrive-connect', `width=${w},height=${h},left=${left},top=${top}`);

      // Popup bloquée par le navigateur → on retombe sur la redirection plein écran.
      if (!popup) {
        window.location.href = url;
        return;
      }

      const onMessage = (ev: MessageEvent) => {
        if (ev.origin !== window.location.origin || ev.data?.type !== 'gdrive-connect') return;
        cleanup();
        if (ev.data.error) setError(decodeURIComponent(ev.data.error));
        else setNotice('Stockage connecté avec succès.');
        refreshStatus(); // connected → l'effet charge automatiquement les fichiers
        try { popup.close(); } catch { /* déjà fermée */ }
      };

      // Filet de sécurité : si la popup est fermée sans message, on re-vérifie le statut.
      const timer = window.setInterval(() => {
        if (popup.closed) { cleanup(); refreshStatus(); }
      }, 800);

      function cleanup() {
        window.clearInterval(timer);
        window.removeEventListener('message', onMessage);
      }

      window.addEventListener('message', onMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de lancer la connexion.');
    }
  }

  if (connected === null) {
    return (
      <div className="space-y-6">
        <Header provider={provider} onProviderChange={selectProvider} />
        <div className="h-40 animate-pulse rounded-xl bg-slate-800/40" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-6">
        <Header provider={provider} onProviderChange={selectProvider} />
        {notice && <Alert variant="success">{notice}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        <NotConnected provider={provider} onConnect={handleConnect} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header provider={provider} onProviderChange={selectProvider} />
      {notice && <Alert variant="success">{notice}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      {!privateKey && (
        <Alert variant="warning" title="Clé privée non chargée">
          Vous pouvez parcourir et importer des fichiers, mais le téléchargement (déchiffrement) nécessite votre clé
          privée. Reconnectez-vous avec votre mot de passe maître pour l&apos;activer.
        </Alert>
      )}
      <Browser
        token={token}
        currentUserId={user.id}
        provider={provider}
        pubKeyB64={user.pub_key}
        privateKey={privateKey}
        signingPrivateKey={signingPrivateKey}
        data={data}
        loading={loading}
        folderId={folderId}
        onNavigate={load}
        onError={setError}
        onNotice={setNotice}
        reload={() => load(folderId)}
        onSharedChange={() => setSharedReloadKey((n) => n + 1)}
      />
      <SharedFilesSection
        token={token}
        currentUserId={user.id}
        privateKey={privateKey}
        signingPrivateKey={signingPrivateKey}
        reloadKey={sharedReloadKey}
        onError={setError}
        onNotice={setNotice}
      />
    </div>
  );
}

function Header({
  provider,
  onProviderChange,
}: {
  provider: drive.CloudProvider;
  onProviderChange: (provider: drive.CloudProvider) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Mes fichiers</h1>
        <p className="mt-1 text-sm text-slate-400">
          Chiffrés de bout en bout sur votre stockage cloud. Le serveur ne voit jamais le contenu.
        </p>
      </div>
      <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-1">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onProviderChange(p.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              provider === p.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Vue "non connecté" ────────────────────────────────────────────────────────

function NotConnected({ provider, onConnect }: { provider: drive.CloudProvider; onConnect: () => void }) {
  const label = providerLabel(provider);
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-10 text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-slate-500">
        {I.folder('h-8 w-8')}
      </div>
      <h2 className="text-lg font-semibold text-slate-100">Vous n&apos;êtes pas connecté à {label}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
        Connectez votre compte {label} pour stocker vos fichiers chiffrés. Vos fichiers sont chiffrés sur votre
        appareil avant l&apos;envoi : le provider ne voit que des données illisibles.
      </p>
      <div className="mt-6">
        <Button onClick={onConnect} className="mx-auto">
          {providerIcon(provider)} Se connecter à {label}
        </Button>
      </div>
    </div>
  );
}

// ── Explorateur ───────────────────────────────────────────────────────────────

type Modal =
  | { kind: 'newFolder' }
  | { kind: 'renameFolder'; folder: DriveFolder }
  | { kind: 'renameFile'; file: DriveFile }
  | { kind: 'deleteFolder'; folder: DriveFolder }
  | { kind: 'deleteFile'; file: DriveFile }
  | { kind: 'moveFolder'; folder: DriveFolder }
  | { kind: 'moveFile'; file: DriveFile }
  | { kind: 'shareFile'; file: DriveFile }
  | { kind: 'manageShares'; file: DriveFile }
  | null;

type UploadConflictDecision =
  | { action: 'rename'; name: string }
  | { action: 'replace-preserve'; file: DriveFile }
  | { action: 'replace-rotate'; file: DriveFile; keepShares: drive.FileShare[] }
  | { action: 'cancel' };

function Browser({
  token,
  currentUserId,
  provider,
  pubKeyB64,
  privateKey,
  signingPrivateKey,
  data,
  loading,
  folderId,
  onNavigate,
  onError,
  onNotice,
  reload,
  onSharedChange,
}: {
  token: string;
  currentUserId: string;
  provider: drive.CloudProvider;
  pubKeyB64: string;
  privateKey: CryptoKey | null;
  signingPrivateKey: CryptoKey | null;
  data: BrowseResult | null;
  loading: boolean;
  folderId: string | null;
  onNavigate: (id: string | null) => void;
  onError: (m: string) => void;
  onNotice: (m: string) => void;
  reload: () => void;
  onSharedChange: () => void;
}) {
  const [modal, setModal] = useState<Modal>(null);
  const [dragOver, setDragOver] = useState(false);
  const [upload, setUpload] = useState<{ done: number; total: number; name: string } | null>(null);
  const [uploadConflict, setUploadConflict] = useState<{
    incomingName: string;
    existingFile: DriveFile;
    resolve: (decision: UploadConflictDecision) => void;
  } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const askUploadConflict = useCallback((incomingName: string, existingFile: DriveFile) => (
    new Promise<UploadConflictDecision>((resolve) => {
      setUploadConflict({ incomingName, existingFile, resolve });
    })
  ), []);

  // ── Upload (chiffrement côté client) ───────────────────────────────────────
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      onError('');
      try {
        if (!signingPrivateKey) {
          throw new Error('Clé de signature absente : reconnectez-vous ou recréez un compte avec la PKI légère.');
        }
        const publicKey = await importPublicKey(pubKeyB64);
        setUpload({ done: 0, total: files.length, name: files[0].name });
        const namesInFolder = new Map(
          (data?.files ?? []).map((file) => [file.name.toLocaleLowerCase(), file]),
        );
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          let targetName = f.name;
          let replaceFileId: string | null = null;
          let replaceMode: 'preserve' | 'rotate' | undefined;
          let replacementShares: Array<{ userId: string; enc_fek: string }> | undefined;
          let reuseExistingFekFrom: DriveFile | null = null;
          let rotateKeepShares: drive.FileShare[] = [];
          const existing = namesInFolder.get(targetName.toLocaleLowerCase());
          if (existing) {
            setUpload(null);
            const decision = await askUploadConflict(targetName, existing);
            if (decision.action === 'cancel') continue;
            if (decision.action === 'replace-preserve') {
              replaceFileId = decision.file.id;
              replaceMode = 'preserve';
              reuseExistingFekFrom = decision.file;
            }
            if (decision.action === 'replace-rotate') {
              replaceFileId = decision.file.id;
              replaceMode = 'rotate';
              rotateKeepShares = decision.keepShares;
            }
            if (decision.action === 'rename') targetName = decision.name;
          }

          setUpload({ done: i, total: files.length, name: targetName });
          const plaintext = await f.arrayBuffer();
          let fek: CryptoKey;
          if (reuseExistingFekFrom) {
            if (!privateKey || !reuseExistingFekFrom.enc_fek) {
              throw new Error('Clé privée requise pour remplacer en conservant les partages.');
            }
            fek = await decryptFileKey(reuseExistingFekFrom.enc_fek, privateKey);
          } else {
            fek = await generateFileKey();
          }
          const encryptedBlob = await encryptFileContent(fek, plaintext);
          const encryptedBytes = await encryptedBlob.arrayBuffer();
          const signature = await signBytes(signingPrivateKey, encryptedBytes);
          const encFek = reuseExistingFekFrom?.enc_fek ?? await encryptFileKey(fek, publicKey);
          if (replaceMode === 'rotate') {
            replacementShares = await Promise.all(rotateKeepShares.map(async (share) => {
              const recipientPublicKey = await importPublicKey(share.pub_key);
              return { userId: share.userId, enc_fek: await encryptFileKey(fek, recipientPublicKey) };
            }));
          }
          await drive.uploadFile(token, provider, encryptedBlob, targetName, encFek, folderId, signature, replaceFileId, replaceMode, replacementShares);
          namesInFolder.set(targetName.toLocaleLowerCase(), {
            ...(existing ?? {
              id: '',
              provider,
              mimeType: f.type,
              createdAt: new Date().toISOString(),
              folderId,
              enc_fek: null,
              signature: null,
              signedBy: null,
              sharedCount: 0,
            }),
            name: targetName,
          });
        }
        setUpload(null);
        reload();
      } catch (err) {
        setUpload(null);
        onError(err instanceof Error ? err.message : "Échec de l'import.");
      }
    },
    [token, provider, pubKeyB64, privateKey, signingPrivateKey, folderId, data?.files, askUploadConflict, onError, reload],
  );

  // ── Download (déchiffrement côté client) ───────────────────────────────────
  async function handleDownload(file: DriveFile) {
    if (!privateKey) {
      onError('Clé privée absente : reconnectez-vous pour déchiffrer.');
      return;
    }
    if (!file.enc_fek) {
      onError('Clé de fichier introuvable pour ce fichier.');
      return;
    }
    setDownloadingId(file.id);
    onError('');
    try {
      const fek = await decryptFileKey(file.enc_fek, privateKey);
      const encrypted = await drive.downloadEncrypted(token, file.id);
      if (file.signature && file.signedBy?.sign_pub_key) {
        const publicSigningKey = await importSigningPublicKey(file.signedBy.sign_pub_key);
        const ok = await verifyBytes(publicSigningKey, file.signature, encrypted);
        if (!ok) throw new Error('Signature invalide : le fichier chiffré a été modifié ou ne vient pas du signataire annoncé.');
      }
      const plaintext = await decryptFileContent(fek, encrypted);
      const url = URL.createObjectURL(new Blob([plaintext]));
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Échec du téléchargement / déchiffrement.');
    } finally {
      setDownloadingId(null);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  }

  const isEmpty = data && data.folders.length === 0 && data.files.length === 0;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`rounded-2xl border bg-slate-800/30 transition-colors ${dragOver ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-700/60'}`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 px-4 py-3">
        <Breadcrumb breadcrumb={data?.breadcrumb ?? []} onNavigate={onNavigate} />
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => setModal({ kind: 'newFolder' })}>
            {I.folder('h-4 w-4')} Nouveau dossier
          </Button>
          <Button className="px-3 py-2 text-xs" onClick={() => fileInputRef.current?.click()}>
            {I.upload('h-4 w-4')} Importer
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
          />
        </div>
      </div>

      {/* Upload progress */}
      {upload && (
        <div className="border-b border-slate-700/60 px-4 py-3">
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span className="truncate">Chiffrement & envoi : {upload.name}</span>
            <span>{upload.done}/{upload.total}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(upload.done / upload.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Body */}
      <div className="p-4">
        {loading ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-800/50" />)}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 text-slate-600">{I.upload('h-10 w-10')}</div>
            <p className="text-sm text-slate-400">Ce dossier est vide.</p>
            <p className="mt-1 text-xs text-slate-500">Glissez-déposez des fichiers ici, ou cliquez sur « Importer ».</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Dossiers */}
            {data && data.folders.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Dossiers</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.folders.map((f) => (
                    <FolderCard
                      key={f.id}
                      folder={f}
                      onOpen={() => onNavigate(f.id)}
                      onRename={() => setModal({ kind: 'renameFolder', folder: f })}
                      onMove={() => setModal({ kind: 'moveFolder', folder: f })}
                      onDelete={() => setModal({ kind: 'deleteFolder', folder: f })}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Fichiers */}
            {data && data.files.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Fichiers</p>
                <div className="overflow-hidden rounded-xl border border-slate-700/60">
                  {data.files.map((f) => (
                    <FileRow
                      key={f.id}
                      file={f}
                      downloading={downloadingId === f.id}
                      canDownload={!!privateKey && !!f.enc_fek}
                      onDownload={() => handleDownload(f)}
                      onRename={() => setModal({ kind: 'renameFile', file: f })}
                      onMove={() => setModal({ kind: 'moveFile', file: f })}
                      onShare={() => setModal({ kind: 'shareFile', file: f })}
                      onManageShares={() => setModal({ kind: 'manageShares', file: f })}
                      onDelete={() => setModal({ kind: 'deleteFile', file: f })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal?.kind === 'newFolder' && (
        <TextModal
          title="Nouveau dossier"
          label="Nom du dossier"
          confirmLabel="Créer"
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await drive.createFolder(token, name, folderId, provider);
            setModal(null);
            reload();
          }}
        />
      )}
      {modal?.kind === 'renameFolder' && (
        <TextModal
          title="Renommer le dossier"
          label="Nouveau nom"
          confirmLabel="Renommer"
          initial={modal.folder.name}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await drive.updateFolder(token, modal.folder.id, { name });
            setModal(null);
            reload();
          }}
        />
      )}
      {modal?.kind === 'renameFile' && (
        <TextModal
          title="Renommer le fichier"
          label="Nouveau nom"
          confirmLabel="Renommer"
          initial={modal.file.name}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await drive.updateFile(token, modal.file.id, { name });
            setModal(null);
            reload();
          }}
        />
      )}
      {modal?.kind === 'deleteFolder' && (
        <ConfirmModal
          title="Supprimer le dossier"
          message={`Supprimer « ${modal.folder.name} » et tout son contenu ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await drive.deleteFolder(token, modal.folder.id);
            setModal(null);
            reload();
          }}
        />
      )}
      {modal?.kind === 'deleteFile' && (
        <ConfirmModal
          title="Supprimer le fichier"
          message={`Supprimer définitivement « ${modal.file.name} » ?`}
          confirmLabel="Supprimer"
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await drive.deleteFile(token, modal.file.id);
            setModal(null);
            reload();
          }}
        />
      )}
      {(modal?.kind === 'moveFile' || modal?.kind === 'moveFolder') && (
        <MoveModal
          token={token}
          provider={provider}
          title={modal.kind === 'moveFile' ? `Déplacer « ${modal.file.name} »` : `Déplacer « ${modal.folder.name} »`}
          excludeFolderId={modal.kind === 'moveFolder' ? modal.folder.id : undefined}
          onClose={() => setModal(null)}
          onPick={async (destId) => {
            if (modal.kind === 'moveFile') await drive.updateFile(token, modal.file.id, { folderId: destId });
            else await drive.updateFolder(token, modal.folder.id, { parentId: destId });
            setModal(null);
            reload();
          }}
        />
      )}
      {modal?.kind === 'shareFile' && (
        <ShareModal
          token={token}
          file={modal.file}
          privateKey={privateKey}
          onClose={() => setModal(null)}
          onShared={() => {
            setModal(null);
            onNotice(`« ${modal.file.name} » a été partagé.`);
            reload();
            onSharedChange();
          }}
        />
      )}
      {modal?.kind === 'manageShares' && (
        <ManageSharesModal
          token={token}
          currentUserId={currentUserId}
          file={modal.file}
          onClose={() => setModal(null)}
          onChanged={() => {
            reload();
            onSharedChange();
          }}
        />
      )}
      {uploadConflict && (
        <UploadConflictModal
          token={token}
          incomingName={uploadConflict.incomingName}
          existingFile={uploadConflict.existingFile}
          onResolve={(decision) => {
            uploadConflict.resolve(decision);
            setUploadConflict(null);
          }}
        />
      )}
    </div>
  );
}

// ── Fil d'Ariane ────────────────────────────────────────────────────────────────

function Breadcrumb({
  breadcrumb,
  onNavigate,
}: {
  breadcrumb: { id: string; name: string }[];
  onNavigate: (id: string | null) => void;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      <button onClick={() => onNavigate(null)} className="rounded px-1.5 py-0.5 font-medium text-slate-300 hover:bg-slate-700/50 hover:text-slate-100">
        Racine
      </button>
      {breadcrumb.map((b) => (
        <span key={b.id} className="flex items-center gap-1">
          <span className="text-slate-600">/</span>
          <button onClick={() => onNavigate(b.id)} className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-slate-700/50 hover:text-slate-100">
            {b.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

// ── Carte dossier ────────────────────────────────────────────────────────────────

function FolderCard({
  folder,
  onOpen,
  onRename,
  onMove,
  onDelete,
}: {
  folder: DriveFolder;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 transition-colors hover:border-slate-600 hover:bg-slate-900/70">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="text-amber-400">{I.folder('h-6 w-6')}</span>
        <span className="truncate text-sm font-medium text-slate-200">{folder.name}</span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <IconBtn title="Renommer" onClick={onRename}>{I.edit('h-4 w-4')}</IconBtn>
        <IconBtn title="Déplacer" onClick={onMove}>{I.move('h-4 w-4')}</IconBtn>
        <IconBtn title="Supprimer" danger onClick={onDelete}>{I.trash('h-4 w-4')}</IconBtn>
      </div>
    </div>
  );
}

// ── Ligne fichier ────────────────────────────────────────────────────────────────

function FileRow({
  file,
  downloading,
  canDownload,
  onDownload,
  onRename,
  onMove,
  onShare,
  onManageShares,
  onDelete,
}: {
  file: DriveFile;
  downloading: boolean;
  canDownload: boolean;
  onDownload: () => void;
  onRename: () => void;
  onMove: () => void;
  onShare: () => void;
  onManageShares: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 border-b border-slate-700/40 bg-slate-900/30 px-3 py-2.5 last:border-b-0 hover:bg-slate-900/60">
      <span className="text-slate-400">{I.file('h-5 w-5')}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-200">{file.name}</p>
        <p className="text-xs text-slate-500">{formatDate(file.createdAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <IconBtn
          title={canDownload ? 'Télécharger & déchiffrer' : 'Clé privée requise (reconnectez-vous)'}
          onClick={onDownload}
          disabled={!canDownload || downloading}
          loading={downloading}
        >
          {I.download('h-4 w-4')}
        </IconBtn>
        <span className="opacity-0 transition-opacity group-hover:opacity-100 flex items-center gap-0.5">
          <IconBtn title="Renommer" onClick={onRename}>{I.edit('h-4 w-4')}</IconBtn>
          <IconBtn title="Déplacer" onClick={onMove}>{I.move('h-4 w-4')}</IconBtn>
          <IconBtn title="Partager" onClick={onShare}>{I.share('h-4 w-4')}</IconBtn>
          {file.sharedCount > 0 && (
            <IconBtn title={`Gérer les partages (${file.sharedCount})`} onClick={onManageShares}>
              <span className="relative">
                {I.share('h-4 w-4')}
                <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[9px] font-semibold leading-none text-slate-950">
                  {file.sharedCount}
                </span>
              </span>
            </IconBtn>
          )}
          <IconBtn title="Supprimer" danger onClick={onDelete}>{I.trash('h-4 w-4')}</IconBtn>
        </span>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
  disabled,
  loading,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-slate-400 hover:bg-red-500/10 hover:text-red-400' : 'text-slate-400 hover:bg-slate-700/60 hover:text-slate-100'
      }`}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" /> : children}
    </button>
  );
}

// ── Fichiers partagés avec moi ──────────────────────────────────────────────────

function SharedFilesSection({
  token,
  currentUserId,
  privateKey,
  signingPrivateKey,
  reloadKey,
  onError,
  onNotice,
}: {
  token: string;
  currentUserId: string;
  privateKey: CryptoKey | null;
  signingPrivateKey: CryptoKey | null;
  reloadKey: number;
  onError: (m: string) => void;
  onNotice: (m: string) => void;
}) {
  const [files, setFiles] = useState<SharedDriveFile[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<SharedDriveFile | null>(null);

  const loadShared = useCallback(async () => {
    setLoading(true);
    try {
      const res = await drive.sharedWithMe(token);
      setFiles(res.files);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Impossible de charger les fichiers partagés.');
    } finally {
      setLoading(false);
    }
  }, [token, onError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des fichiers partagés au montage / refresh
    loadShared();
  }, [loadShared, reloadKey]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return files;
    return files.filter((file) =>
      file.owner.username.toLowerCase().includes(q) ||
      file.owner.email.toLowerCase().includes(q),
    );
  }, [files, filter]);

  async function download(file: SharedDriveFile) {
    if (!privateKey) {
      onError('Clé privée absente : reconnectez-vous pour déchiffrer.');
      return;
    }
    if (!file.enc_fek) {
      onError('Clé de fichier introuvable pour ce fichier partagé.');
      return;
    }
    setDownloadingId(file.id);
    onError('');
    try {
      const fek = await decryptFileKey(file.enc_fek, privateKey);
      const encrypted = await drive.downloadEncrypted(token, file.id);
      if (file.signature && file.signedBy?.sign_pub_key) {
        const publicSigningKey = await importSigningPublicKey(file.signedBy.sign_pub_key);
        const ok = await verifyBytes(publicSigningKey, file.signature, encrypted);
        if (!ok) throw new Error('Signature invalide : le fichier partagé ne correspond pas à la signature du propriétaire.');
      }
      const plaintext = await decryptFileContent(fek, encrypted);
      const url = URL.createObjectURL(new Blob([plaintext]));
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Échec du téléchargement / déchiffrement.');
    } finally {
      setDownloadingId(null);
    }
  }

  async function replaceSharedFile(file: SharedDriveFile, replacement: File) {
    if (!privateKey) {
      onError('Clé privée absente : reconnectez-vous pour remplacer ce fichier.');
      return;
    }
    if (!signingPrivateKey) {
      onError('Clé de signature absente : reconnectez-vous pour signer le remplacement.');
      return;
    }
    if (!file.enc_fek) {
      onError('Clé de fichier introuvable pour ce fichier partagé.');
      return;
    }
    setReplacingId(file.id);
    onError('');
    try {
      const fek = await decryptFileKey(file.enc_fek, privateKey);
      const plaintext = await replacement.arrayBuffer();
      const encryptedBlob = await encryptFileContent(fek, plaintext);
      const encryptedBytes = await encryptedBlob.arrayBuffer();
      const signature = await signBytes(signingPrivateKey, encryptedBytes);
      await drive.uploadFile(
        token,
        file.provider,
        encryptedBlob,
        replacement.name,
        file.enc_fek,
        file.folderId,
        signature,
        file.id,
        'preserve',
      );
      onNotice(`« ${file.name} » a été remplacé par « ${replacement.name} ».`);
      await loadShared();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Échec du remplacement.');
    } finally {
      setReplacingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-800/30">
      <input
        ref={replaceInputRef}
        type="file"
        hidden
        onChange={(e) => {
          const file = replaceTargetRef.current;
          const replacement = e.target.files?.[0];
          e.target.value = '';
          replaceTargetRef.current = null;
          if (file && replacement) replaceSharedFile(file, replacement);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Fichiers partagés avec moi</h2>
          <p className="text-xs text-slate-500">{files.length} fichier{files.length > 1 ? 's' : ''}</p>
        </div>
        <Input
          aria-label="Filtrer par utilisateur"
          placeholder="Filtrer par utilisateur"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 w-64"
        />
      </div>

      <div className="p-4">
        {loading ? (
          <div className="h-14 animate-pulse rounded-xl bg-slate-800/50" />
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {files.length === 0 ? 'Aucun fichier partagé pour le moment.' : 'Aucun fichier pour ce filtre.'}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-700/60">
            {filtered.map((file) => (
              <div key={file.id} className="flex items-center gap-3 border-b border-slate-700/40 bg-slate-900/30 px-3 py-2.5 last:border-b-0 hover:bg-slate-900/60">
                <span className="text-slate-400">{I.file('h-5 w-5')}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-200">{file.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    Partagé par {file.owner.username} · {formatDate(file.sharedAt)}
                  </p>
                </div>
                <IconBtn
                  title={privateKey ? 'Télécharger & déchiffrer' : 'Clé privée requise (reconnectez-vous)'}
                  onClick={() => download(file)}
                  disabled={!file.read || !privateKey || !file.enc_fek || downloadingId === file.id}
                  loading={downloadingId === file.id}
                >
                  {I.download('h-4 w-4')}
                </IconBtn>
                {file.write && (
                  <IconBtn
                    title={signingPrivateKey ? 'Remplacer le fichier' : 'Clé de signature requise'}
                    onClick={() => {
                      replaceTargetRef.current = file;
                      replaceInputRef.current?.click();
                    }}
                    disabled={!privateKey || !signingPrivateKey || replacingId === file.id}
                    loading={replacingId === file.id}
                  >
                    {I.upload('h-4 w-4')}
                  </IconBtn>
                )}
                {file.manage && (
                  <>
                    <IconBtn title="Partager" onClick={() => setModal({ kind: 'shareFile', file })}>
                      {I.share('h-4 w-4')}
                    </IconBtn>
                    <IconBtn title="Gérer les partages" onClick={() => setModal({ kind: 'manageShares', file })}>
                      {I.edit('h-4 w-4')}
                    </IconBtn>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {modal?.kind === 'shareFile' && (
        <ShareModal
          token={token}
          file={modal.file}
          privateKey={privateKey}
          onClose={() => setModal(null)}
          onShared={() => {
            setModal(null);
            onNotice(`« ${modal.file.name} » a été partagé.`);
            loadShared();
          }}
        />
      )}
      {modal?.kind === 'manageShares' && (
        <ManageSharesModal
          token={token}
          currentUserId={currentUserId}
          file={modal.file}
          onClose={() => setModal(null)}
          onChanged={loadShared}
        />
      )}
    </section>
  );
}

// ── Modals ───────────────────────────────────────────────────────────────────────

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function TextModal({
  title,
  label,
  confirmLabel,
  initial = '',
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  confirmLabel: string;
  initial?: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true); setErr('');
    try { await onSubmit(value.trim()); }
    catch (e2) { setBusy(false); setErr(e2 instanceof Error ? e2.message : 'Erreur.'); }
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="mb-4 text-base font-semibold text-slate-100">{title}</h3>
      <form onSubmit={submit} className="space-y-4">
        {err && <Alert variant="error">{err}</Alert>}
        <Input label={label} value={value} onChange={(e) => setValue(e.target.value)} autoFocus required />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" isLoading={busy}>{confirmLabel}</Button>
        </div>
      </form>
    </Overlay>
  );
}

function ShareModal({
  token,
  file,
  privateKey,
  onClose,
  onShared,
}: {
  token: string;
  file: DriveFile;
  privateKey: CryptoKey | null;
  onClose: () => void;
  onShared: () => void;
}) {
  const [query, setQuery] = useState('');
  const [canRead, setCanRead] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    if (!privateKey) {
      setErr('Clé privée absente : reconnectez-vous pour partager.');
      return;
    }
    if (!file.enc_fek) {
      setErr('Clé de fichier introuvable pour ce fichier.');
      return;
    }
    const read = canRead || canWrite || canManage;

    setBusy(true);
    setErr('');
    try {
      const recipient = await drive.lookupUser(token, query.trim());
      const recipientPublicKey = await importPublicKey(recipient.pub_key);
      const encFek = await reencryptFileKey(file.enc_fek, privateKey, recipientPublicKey);
      await drive.shareFile(token, file.id, {
        recipientUserId: recipient.id,
        enc_fek: encFek,
        read,
        write: canWrite,
        manage: canManage,
      });
      onShared();
    } catch (e2) {
      setBusy(false);
      setErr(e2 instanceof Error ? e2.message : 'Partage impossible.');
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="mb-2 text-base font-semibold text-slate-100">Partager le fichier</h3>
      <p className="mb-4 truncate text-sm text-slate-400">{file.name}</p>
      <form onSubmit={submit} className="space-y-4">
        {err && <Alert variant="error">{err}</Alert>}
        <Input
          label="Utilisateur"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="email ou nom d'utilisateur"
          autoFocus
          required
        />
        <div className="space-y-2 rounded-xl border border-slate-700/60 p-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={canRead || canWrite || canManage}
              disabled={canWrite || canManage}
              onChange={(e) => setCanRead(e.target.checked)}
              className="mt-1 accent-emerald-500"
            />
            <span>
              <span className="block font-medium text-slate-200">Télécharger</span>
              <span className="text-xs text-slate-500">Voir le fichier partagé et le déchiffrer.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={canWrite}
              onChange={(e) => {
                setCanWrite(e.target.checked);
                if (e.target.checked) setCanRead(true);
              }}
              className="mt-1 accent-emerald-500"
            />
            <span>
              <span className="block font-medium text-slate-200">Remplacer</span>
              <span className="text-xs text-slate-500">Écraser le contenu par une nouvelle version chiffrée.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={canManage}
              onChange={(e) => {
                setCanManage(e.target.checked);
                if (e.target.checked) setCanRead(true);
              }}
              className="mt-1 accent-emerald-500"
            />
            <span>
              <span className="block font-medium text-slate-200">Gérer</span>
              <span className="text-xs text-slate-500">Ajouter, modifier ou annuler les partages.</span>
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" isLoading={busy} disabled={!canRead && !canWrite && !canManage}>Partager</Button>
        </div>
      </form>
    </Overlay>
  );
}

function ManageSharesModal({
  token,
  currentUserId,
  file,
  onClose,
  onChanged,
}: {
  token: string;
  currentUserId: string;
  file: DriveFile;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [shares, setShares] = useState<drive.FileShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const loadShares = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await drive.listFileShares(token, file.id);
      setShares(res.shares);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Impossible de charger les partages.');
    } finally {
      setLoading(false);
    }
  }, [token, file.id]);

  useEffect(() => {
    void Promise.resolve().then(loadShares);
  }, [loadShares]);

  async function revoke(share: drive.FileShare) {
    setBusyUserId(share.userId);
    setErr('');
    try {
      await drive.revokeFileShare(token, file.id, share.userId);
      setShares((current) => current.filter((item) => item.userId !== share.userId));
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Impossible d’annuler ce partage.');
    } finally {
      setBusyUserId(null);
    }
  }

  async function updateRights(share: drive.FileShare, changes: { read?: boolean; write?: boolean; manage?: boolean }) {
    setBusyUserId(share.userId);
    setErr('');
    try {
      const nextWrite = changes.write ?? share.write;
      const nextManage = changes.manage ?? share.manage;
      const nextRead = (changes.read ?? share.read) || nextWrite || nextManage;
      const res = await drive.updateFileShare(token, file.id, share.userId, {
        read: nextRead,
        write: nextWrite,
        manage: nextManage,
      });
      setShares((current) => current.map((item) => (item.userId === share.userId ? res.share : item)));
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Impossible de modifier ces droits.');
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="mb-2 text-base font-semibold text-slate-100">Gérer les partages</h3>
      <p className="mb-4 truncate text-sm text-slate-400">{file.name}</p>
      {err && <Alert variant="error" className="mb-4">{err}</Alert>}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: Math.max(1, file.sharedCount) }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-800/70" />
          ))}
        </div>
      ) : shares.length === 0 ? (
        <Alert variant="info" className="mb-4">Ce fichier n’est plus partagé avec personne.</Alert>
      ) : (
        <div className="max-h-72 overflow-auto rounded-xl border border-slate-700/60">
          {shares.map((share) => {
            const isSelf = share.userId === currentUserId;
            const disabled = busyUserId !== null || isSelf;
            return (
              <div key={share.userId} className="border-b border-slate-700/50 px-3 py-2.5 last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {share.username}{isSelf ? ' · Vous' : ''}
                    </p>
                    <p className="truncate text-xs text-slate-500">{share.email}</p>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    className="px-2.5 py-1.5 text-xs"
                    isLoading={busyUserId === share.userId}
                    disabled={disabled}
                    onClick={() => revoke(share)}
                  >
                    Annuler
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={share.read || share.write || share.manage}
                      disabled={disabled || share.write || share.manage}
                      onChange={(e) => updateRights(share, { read: e.target.checked })}
                      className="accent-emerald-500"
                    />
                    Télécharger
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={share.write}
                      disabled={disabled}
                      onChange={(e) => updateRights(share, { write: e.target.checked })}
                      className="accent-emerald-500"
                    />
                    Remplacer
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={share.manage}
                      disabled={disabled}
                      onChange={(e) => updateRights(share, { manage: e.target.checked })}
                      className="accent-emerald-500"
                    />
                    Gérer
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button type="button" variant="ghost" onClick={onClose}>Fermer</Button>
      </div>
    </Overlay>
  );
}

function UploadConflictModal({
  token,
  incomingName,
  existingFile,
  onResolve,
}: {
  token: string;
  incomingName: string;
  existingFile: DriveFile;
  onResolve: (decision: UploadConflictDecision) => void;
}) {
  const [newName, setNewName] = useState(suggestCopyName(incomingName));
  const [shares, setShares] = useState<drive.FileShare[]>([]);
  const [selectedShareIds, setSelectedShareIds] = useState<Set<string>>(new Set());
  const [loadingShares, setLoadingShares] = useState(existingFile.sharedCount > 0);
  const [err, setErr] = useState('');
  const trimmed = newName.trim();
  const canRename = trimmed.length > 0 && trimmed.toLocaleLowerCase() !== existingFile.name.toLocaleLowerCase();

  useEffect(() => {
    if (existingFile.sharedCount <= 0) return;
    let cancelled = false;
    drive.listFileShares(token, existingFile.id)
      .then((res) => {
        if (cancelled) return;
        setShares(res.shares);
        setSelectedShareIds(new Set(res.shares.map((share) => share.userId)));
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Impossible de charger les partages.');
      })
      .finally(() => {
        if (!cancelled) setLoadingShares(false);
      });
    return () => { cancelled = true; };
  }, [token, existingFile.id, existingFile.sharedCount]);

  function toggleShare(userId: string) {
    setSelectedShareIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const selectedShares = shares.filter((share) => selectedShareIds.has(share.userId));
  const shouldPreserveAllShares = shares.length === 0 || selectedShares.length === shares.length;

  function replaceFile() {
    if (shouldPreserveAllShares) {
      onResolve({ action: 'replace-preserve', file: existingFile });
    } else {
      onResolve({ action: 'replace-rotate', file: existingFile, keepShares: selectedShares });
    }
  }

  return (
    <Overlay onClose={() => onResolve({ action: 'cancel' })}>
      <h3 className="mb-2 text-base font-semibold text-slate-100">Fichier déjà existant</h3>
      <p className="mb-4 text-sm text-slate-400">
        Un fichier nommé <span className="font-medium text-slate-200">« {existingFile.name} »</span> existe déjà dans ce dossier.
      </p>

      <div className="space-y-4">
        {err && <Alert variant="error">{err}</Alert>}
        <Input
          label="Renommer le nouveau fichier"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          autoFocus
        />

        {existingFile.sharedCount > 0 && (
          <div className="rounded-xl border border-slate-700/60 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Partages conservés
            </p>
            {loadingShares ? (
              <div className="h-12 animate-pulse rounded-lg bg-slate-800/70" />
            ) : shares.length === 0 ? (
              <p className="text-sm text-slate-400">Aucun partage actif.</p>
            ) : (
              <div className="max-h-32 space-y-1 overflow-auto">
                {shares.map((share) => (
                  <label key={share.userId} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={selectedShareIds.has(share.userId)}
                      onChange={() => toggleShare(share.userId)}
                      className="accent-emerald-500"
                    />
                    <span className="min-w-0 flex-1 truncate">{share.username}</span>
                    <span className="truncate text-xs text-slate-500">{share.email}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!canRename}
            onClick={() => onResolve({ action: 'rename', name: trimmed })}
          >
            Renommer
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={loadingShares}
            onClick={replaceFile}
          >
            Remplacer
          </Button>
          <Button type="button" variant="ghost" onClick={() => onResolve({ action: 'cancel' })}>
            Annuler
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

function suggestCopyName(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot > 0) return `${name.slice(0, dot)} (copie)${name.slice(dot)}`;
  return `${name} (copie)`;
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function confirm() {
    setBusy(true); setErr('');
    try { await onConfirm(); }
    catch (e) { setBusy(false); setErr(e instanceof Error ? e.message : 'Erreur.'); }
  }
  return (
    <Overlay onClose={onClose}>
      <h3 className="mb-2 text-base font-semibold text-slate-100">{title}</h3>
      <p className="mb-4 text-sm text-slate-400">{message}</p>
      {err && <Alert variant="error" className="mb-4">{err}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
        <Button type="button" variant="danger" isLoading={busy} onClick={confirm}>{confirmLabel}</Button>
      </div>
    </Overlay>
  );
}

// Sélecteur de destination : mini-navigateur de dossiers.
function MoveModal({
  token,
  provider,
  title,
  excludeFolderId,
  onClose,
  onPick,
}: {
  token: string;
  provider: drive.CloudProvider;
  title: string;
  excludeFolderId?: string;
  onClose: () => void;
  onPick: (destId: string | null) => Promise<void>;
}) {
  const [fid, setFid] = useState<string | null>(null);
  const [res, setRes] = useState<BrowseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadDir = useCallback(async (id: string | null) => {
    setErr('');
    try { setRes(await drive.browse(token, id, provider)); setFid(id); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Erreur.'); }
  }, [token, provider]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial du sélecteur
    loadDir(null);
  }, [loadDir]);

  const folders = useMemo(
    () => (res?.folders ?? []).filter((f) => f.id !== excludeFolderId),
    [res, excludeFolderId],
  );

  async function pickHere() {
    setBusy(true); setErr('');
    try { await onPick(fid); }
    catch (e) { setBusy(false); setErr(e instanceof Error ? e.message : 'Déplacement impossible.'); }
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="mb-3 text-base font-semibold text-slate-100">{title}</h3>
      {err && <Alert variant="error" className="mb-3">{err}</Alert>}

      <Breadcrumb breadcrumb={res?.breadcrumb ?? []} onNavigate={loadDir} />

      <div className="my-3 max-h-56 overflow-y-auto rounded-xl border border-slate-700/60">
        {folders.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-500">Aucun sous-dossier ici.</p>
        ) : (
          folders.map((f) => (
            <button
              key={f.id}
              onClick={() => loadDir(f.id)}
              className="flex w-full items-center gap-2 border-b border-slate-700/40 px-3 py-2 text-left text-sm text-slate-200 last:border-b-0 hover:bg-slate-800"
            >
              <span className="text-amber-400">{I.folder('h-4 w-4')}</span>
              <span className="truncate">{f.name}</span>
            </button>
          ))
        )}
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Destination : <span className="text-slate-300">{res?.folder ? res.folder.name : 'Racine'}</span>
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
        <Button type="button" isLoading={busy} onClick={pickHere}>Déplacer ici</Button>
      </div>
    </Overlay>
  );
}
