// LocalStorage helpers — only non-secret data is persisted here.
// salt_mp and salt_rc are NOT secrets (security comes from the password, not the salt),
// but we must store them locally so the client can derive auth_hash on future logins.

const TOKEN_KEY = 'blind_token';
const SALT_PREFIX = 'blind_salt_';
// Clé privée déchiffrée, conservée en sessionStorage (pas localStorage) : effacée
// automatiquement à la fermeture de l'onglet, et jamais partagée entre onglets.
// Compromis assumé : survit aux rechargements/redirections (meilleure UX) sans
// persister sur le disque au-delà de la session de l'onglet.
const PRIVATE_KEY_KEY = 'blind_pk';
const SIGNING_PRIVATE_KEY_KEY = 'blind_sign_pk';

export interface StoredSalts {
  salt_mp: string; // base64
  salt_rc: string; // base64
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function loadToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Clé privée (session de l'onglet uniquement) ──────────────────────────────────

export function savePrivateKey(pkcs8B64: string) {
  try { sessionStorage.setItem(PRIVATE_KEY_KEY, pkcs8B64); } catch { /* quota/indispo */ }
}

export function saveSigningPrivateKey(pkcs8B64: string) {
  try { sessionStorage.setItem(SIGNING_PRIVATE_KEY_KEY, pkcs8B64); } catch { /* quota/indispo */ }
}

export function loadPrivateKey(): string | null {
  try { return sessionStorage.getItem(PRIVATE_KEY_KEY); } catch { return null; }
}

export function loadSigningPrivateKey(): string | null {
  try { return sessionStorage.getItem(SIGNING_PRIVATE_KEY_KEY); } catch { return null; }
}

export function clearPrivateKey() {
  try { sessionStorage.removeItem(PRIVATE_KEY_KEY); } catch { /* indispo */ }
}

export function clearSigningPrivateKey() {
  try { sessionStorage.removeItem(SIGNING_PRIVATE_KEY_KEY); } catch { /* indispo */ }
}

export function saveSalts(username: string, salts: StoredSalts) {
  localStorage.setItem(SALT_PREFIX + username, JSON.stringify(salts));
}

export function loadSalts(username: string): StoredSalts | null {
  const raw = localStorage.getItem(SALT_PREFIX + username);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSalts;
  } catch {
    return null;
  }
}
