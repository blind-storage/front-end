// All crypto runs client-side. The server never sees plaintext keys or passwords.
// Format for AES-GCM encrypted blobs: base64(iv):base64(ciphertext)

export function toBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function generateSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

// Generates a human-readable 128-bit recovery code: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return [0, 4, 8, 12, 16, 20, 24, 28].map((i) => hex.slice(i, i + 4)).join('-');
}

// Derives KEK_1 (first 32 bytes) and auth_hash (last 32 bytes) from master password.
// A single PBKDF2 call produces 512 bits; we split to avoid two expensive derivations.
export async function deriveMasterKeys(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<{ kek: CryptoKey; authHash: string }> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    512,
  );
  const kekBytes = new Uint8Array(bits, 0, 32);
  const authHashBytes = new Uint8Array(bits, 32, 32);
  const kek = await crypto.subtle.importKey('raw', kekBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
  return { kek, authHash: toBase64(authHashBytes) };
}

// Derives KEK_2 from the recovery code (used to re-encrypt the private key at registration).
export async function deriveRecoveryKey(recoveryCode: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(recoveryCode), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  return toBase64(await crypto.subtle.exportKey('spki', key));
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', fromBase64(b64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, [
    'encrypt',
  ]);
}

export async function exportPrivateKeyBytes(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('pkcs8', key);
}

export async function importPrivateKey(pkcs8: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);
}

// AES-GCM encrypt → "base64(iv):base64(ciphertext)"
export async function aesEncrypt(key: CryptoKey, data: ArrayBuffer): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return `${toBase64(iv)}:${toBase64(ct)}`;
}

// AES-GCM decrypt from "base64(iv):base64(ciphertext)"
export async function aesDecrypt(key: CryptoKey, encoded: string): Promise<ArrayBuffer> {
  const [ivB64, ctB64] = encoded.split(':');
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(fromBase64(ivB64)) }, key, fromBase64(ctB64));
}

export async function encryptPrivateKey(privateKey: CryptoKey, kek: CryptoKey): Promise<string> {
  return aesEncrypt(kek, await exportPrivateKeyBytes(privateKey));
}

export async function decryptPrivateKey(encrypted: string, kek: CryptoKey): Promise<CryptoKey> {
  return importPrivateKey(await aesDecrypt(kek, encrypted));
}

export async function generateTEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

// Encrypts the raw TEK bytes with the user's RSA public key.
export async function encryptTEK(tek: CryptoKey, publicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', tek);
  const ct = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, raw);
  return toBase64(ct);
}

// Builds a base64-encoded encrypted empty tree blob using the TEK.
export async function createInitialTree(tek: CryptoKey): Promise<string> {
  const enc = new TextEncoder();
  return aesEncrypt(tek, enc.encode(JSON.stringify({ version: 1, nodes: [] })).buffer as ArrayBuffer);
}
