// Client-side PKI verification using the Web Crypto API.
// The CA uses ECDSA P-256 with SHA-256. Signatures are in IEEE P1363 format
// (raw r||s, 64 bytes) so they can be verified directly by subtle.verify.

import { fromBase64 } from './crypto';
import type { BlindCertificate, BlindCrl } from './api';

export type CertTrustResult =
  | { trusted: true }
  | { trusted: false; reason: string };

// Parse a PEM public key and import it as a Web Crypto ECDSA P-256 key.
export async function importCaPublicKey(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  return crypto.subtle.importKey(
    'spki',
    fromBase64(b64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
}

// Verify the CA signature over a certificate.
// The payload is the deterministic JSON.stringify of the BlindCertificate object.
export async function verifyCertificate(
  cert: BlindCertificate,
  signature: string,
  caKey: CryptoKey,
): Promise<boolean> {
  try {
    const payload = new TextEncoder().encode(JSON.stringify(cert));
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      caKey,
      fromBase64(signature),
      payload,
    );
  } catch {
    return false;
  }
}

export function isCertRevoked(fingerprint: string, crl: BlindCrl): boolean {
  return crl.revoked.some((r) => r.fingerprint === fingerprint);
}

// Full trust pipeline: signature check + CRL check.
export async function checkCertificateTrust(
  cert: BlindCertificate,
  signature: string,
  caKey: CryptoKey,
  crl: BlindCrl,
): Promise<CertTrustResult> {
  const valid = await verifyCertificate(cert, signature, caKey);
  if (!valid) return { trusted: false, reason: 'Signature CA invalide' };
  if (isCertRevoked(cert.fingerprint, crl)) return { trusted: false, reason: 'Certificat révoqué' };
  return { trusted: true };
}

// Convenience: load CA key + CRL then check the given cert in one call.
export async function verifyUserCertificate(
  cert: BlindCertificate,
  signature: string,
  caPem: string,
  crl: BlindCrl,
): Promise<CertTrustResult> {
  const caKey = await importCaPublicKey(caPem);
  return checkCertificateTrust(cert, signature, caKey, crl);
}
