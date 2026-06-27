// LocalStorage helpers — only non-secret data is persisted here.
// salt_mp and salt_rc are NOT secrets (security comes from the password, not the salt),
// but we must store them locally so the client can derive auth_hash on future logins.

const TOKEN_KEY = 'blind_token';
const SALT_PREFIX = 'blind_salt_';

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
