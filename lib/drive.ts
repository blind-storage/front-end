// Client API du module cloud-storage (gestionnaire de fichiers chiffrés).
// Le chiffrement/déchiffrement se fait dans la page (lib/crypto) ; ici on ne fait
// que transporter des octets déjà chiffrés.

import { ApiError } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type CloudProvider = 'google-drive' | 'dropbox';

export interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

export interface DriveFile {
  id: string;
  name: string;
  provider: CloudProvider;
  mimeType?: string;
  createdAt: string;
  folderId: string | null;
  enc_fek: string | null;
  signature: string | null;
  signedBy: { id: string; username: string; sign_pub_key: string | null } | null;
  sharedCount: number;
}

export interface FileShare {
  userId: string;
  username: string;
  email: string;
  pub_key: string;
  read: boolean;
  write: boolean;
  grantedAt: string;
}

export interface ShareUser {
  id: string;
  email: string;
  username: string;
  pub_key: string;
  sign_pub_key?: string | null;
}

export interface SharedDriveFile extends DriveFile {
  owner: { id: string; username: string; email: string; sign_pub_key: string | null };
  read: boolean;
  write: boolean;
  sharedAt: string;
}

export interface BrowseResult {
  folder: { id: string; name: string; parentId: string | null } | null;
  breadcrumb: { id: string; name: string }[];
  folders: DriveFolder[];
  files: DriveFile[];
}

export type ProvidersStatus = Record<CloudProvider, { connected: boolean }>;

// ── Helper JSON ────────────────────────────────────────────────────────────────

async function json<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (init.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

// ── Connexion des stockages ─────────────────────────────────────────────────────

export const getProvidersStatus = (token: string) =>
  json<ProvidersStatus>('/cloud-storage/providers', token);

export const getConnectUrl = (token: string, provider: CloudProvider) =>
  json<{ url: string }>(`/cloud-storage/${provider}/connect`, token);

// ── Navigation ──────────────────────────────────────────────────────────────────

export const browse = (token: string, folderId: string | null, provider: CloudProvider) => {
  const params = new URLSearchParams({ provider });
  if (folderId) params.set('folderId', folderId);
  return json<BrowseResult>(`/cloud-storage/browse?${params.toString()}`, token);
};

export const sharedWithMe = (token: string) =>
  json<{ files: SharedDriveFile[] }>('/cloud-storage/shared-with-me', token);

// ── Dossiers ──────────────────────────────────────────────────────────────────

export const createFolder = (token: string, name: string, parentId: string | null, provider: CloudProvider) =>
  json<DriveFolder>('/cloud-storage/folders', token, {
    method: 'POST',
    body: JSON.stringify({ name, parentId, provider }),
  });

export const updateFolder = (token: string, id: string, changes: { name?: string; parentId?: string | null }) =>
  json<DriveFolder>(`/cloud-storage/folders/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });

export const deleteFolder = (token: string, id: string) =>
  json<void>(`/cloud-storage/folders/${id}`, token, { method: 'DELETE' });

// ── Fichiers ──────────────────────────────────────────────────────────────────

// Upload d'un fichier DÉJÀ chiffré (encryptedBlob) + sa clé chiffrée (encFek).
export async function uploadFile(
  token: string,
  provider: CloudProvider,
  encryptedBlob: Blob,
  fileName: string,
  encFek: string,
  folderId: string | null,
  signature?: string,
  replaceFileId?: string | null,
  replaceMode?: 'preserve' | 'rotate',
  replacementShares?: Array<{ userId: string; enc_fek: string }>,
): Promise<{ fileId: string }> {
  const form = new FormData();
  // Le nom transmis devient le nom affiché (stocké en base). Le contenu, lui, est chiffré.
  form.append('file', encryptedBlob, fileName);
  form.append('enc_fek', encFek);
  if (signature) form.append('signature', signature);
  if (replaceFileId) form.append('replaceFileId', replaceFileId);
  if (replaceMode) form.append('replaceMode', replaceMode);
  if (replacementShares) form.append('replacementShares', JSON.stringify(replacementShares));
  if (folderId) form.append('folderId', folderId);

  const res = await fetch(`${API_URL}/cloud-storage/${provider}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Télécharge les octets CHIFFRÉS (à déchiffrer ensuite côté client avec la FEK).
export async function downloadEncrypted(token: string, fileId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${API_URL}/cloud-storage/files/${fileId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string })?.message ?? `HTTP ${res.status}`);
  }
  return res.arrayBuffer();
}

export const updateFile = (token: string, fileId: string, changes: { name?: string; folderId?: string | null }) =>
  json<{ message: string }>(`/cloud-storage/files/${fileId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });

export const deleteFile = (token: string, fileId: string) =>
  json<void>(`/cloud-storage/files/${fileId}`, token, { method: 'DELETE' });

// ── Partage ───────────────────────────────────────────────────────────────────

export const lookupUser = (token: string, query: string) =>
  json<ShareUser>(`/users/lookup?q=${encodeURIComponent(query)}`, token);

export const shareFile = (
  token: string,
  fileId: string,
  data: { recipientUserId: string; enc_fek: string; read?: boolean; write?: boolean },
) =>
  json<{ share: { userId: string; username: string; email: string; read: boolean; write: boolean } }>(
    `/cloud-storage/files/${fileId}/shares`,
    token,
    { method: 'POST', body: JSON.stringify(data) },
  );

export const listFileShares = (token: string, fileId: string) =>
  json<{ shares: FileShare[] }>(`/cloud-storage/files/${fileId}/shares`, token);

export const revokeFileShare = (token: string, fileId: string, userId: string) =>
  json<void>(`/cloud-storage/files/${fileId}/shares/${userId}`, token, { method: 'DELETE' });
