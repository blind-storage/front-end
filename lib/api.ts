import type {
  AuthResponseDto,
  CreateUserDto,
  EnableTotpResponseDto,
  JwtUser,
  OidcConnectionDto,
  OidcLinkPendingResponseDto,
  OidcPendingResponseDto,
  OidcSetupDto,
  TotpRequiredResponseDto,
  UserEntity,
} from '@blind-storage/types';

export type { AuthResponseDto, CreateUserDto, EnableTotpResponseDto, JwtUser, OidcConnectionDto, OidcSetupDto, TotpRequiredResponseDto, UserEntity };

// Login response is either a token, a pending OIDC state, or a TOTP challenge
export type LoginOidcResponse =
  | AuthResponseDto
  | OidcPendingResponseDto
  | OidcLinkPendingResponseDto
  | TotpRequiredResponseDto;

// ── API client ───────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers: extraHeaders, ...rest } = init;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (extraHeaders) Object.assign(headers, extraHeaders);

  const res = await fetch(`${API_URL}${path}`, { ...rest, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────────

// POST /auth/login — the `password` field receives the auth_hash derived client-side
export const login = (username: string, authHash: string) =>
  request<AuthResponseDto | TotpRequiredResponseDto>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password: authHash }),
  });

// POST /auth/totp/verify — second factor after login when TOTP is enabled
export const totpVerify = (totp_token: string, code: string) =>
  request<AuthResponseDto>('/auth/totp/verify', {
    method: 'POST',
    body: JSON.stringify({ totp_token, code }),
  });

export const getProfile = (token: string) =>
  request<JwtUser>('/auth/profile', { token });

export const changePassword = (
  token: string,
  data: { auth_hash: string; priv_key_enc_1: string; salt_mp: string },
) => request<void>('/auth/change-password', { method: 'POST', body: JSON.stringify(data), token });

// ── OIDC ─────────────────────────────────────────────────────────────────────

// Returns the full URL to redirect the browser to for OIDC login
export function oidcLoginUrl(provider: 'google' | 'rezel' | 'dropbox'): string {
  return `${API_URL}/auth/${provider}`;
}

// POST /auth/oidc/setup — finalise account creation after OIDC (setup_token flow)
export const oidcSetup = (data: OidcSetupDto) =>
  request<AuthResponseDto>('/auth/oidc/setup', { method: 'POST', body: JSON.stringify(data) });

// POST /auth/oidc/link-confirm — link an existing account after OIDC (link_token flow)
export const oidcLinkConfirm = (link_token: string, auth_hash: string) =>
  request<AuthResponseDto | TotpRequiredResponseDto>('/auth/oidc/link-confirm', {
    method: 'POST',
    body: JSON.stringify({ link_token, auth_hash }),
  });

// POST /auth/oidc/link-confirm-totp — second step when TOTP is required during link-confirm
export const oidcLinkConfirmTotp = (totp_token: string, code: string) =>
  request<AuthResponseDto>('/auth/oidc/link-confirm-totp', {
    method: 'POST',
    body: JSON.stringify({ totp_token, code }),
  });

// POST /auth/oidc/challenge — get an RSA-OAEP encrypted nonce to prove private key possession
export const getOidcChallenge = (pending_token: string) =>
  request<{ nonce_token: string; encrypted_challenge: string; priv_key_enc_1: string }>(
    '/auth/oidc/challenge',
    { method: 'POST', body: JSON.stringify({ pending_token }) },
  );

// POST /auth/oidc/verify — send decrypted nonce to get a full JWT (or a TOTP challenge)
export const verifyOidcChallenge = (nonce_token: string, plaintext: string) =>
  request<AuthResponseDto | TotpRequiredResponseDto>('/auth/oidc/verify', {
    method: 'POST',
    body: JSON.stringify({ nonce_token, plaintext }),
  });

// POST /auth/oidc/link — link a provider from an already-authenticated account
export const oidcLink = (token: string, oidcToken: string) =>
  request<void>('/auth/oidc/link', {
    method: 'POST',
    body: JSON.stringify({ token: oidcToken }),
    token,
  });

// ── PKI ──────────────────────────────────────────────────────────────────────

export interface BlindCertificate {
  version: 1;
  subject: { id: string; username: string; email: string };
  pub_key: string;
  fingerprint: string;
  issued_at: string;
  expires_at: string;
}

export interface BlindCrl {
  version: 1;
  issued_at: string;
  revoked: { fingerprint: string; revoked_at: string; reason: string }[];
}

// GET /pki/ca — clé publique de la CA (PEM)
export const getCaCert = () => request<{ pub_key: string }>('/pki/ca');

// GET /pki/crl — liste de révocation signée
export const getCrl = () => request<{ crl: BlindCrl; signature: string }>('/pki/crl');

// ── Users ────────────────────────────────────────────────────────────────────

// The backend returns UserEntity but may include extra fields (salts, encrypted keys)
// that are only available to the account owner. We extend the type locally.
export interface UserResponse extends UserEntity {
  salt_mp?: string;
  salt_rc?: string;
  priv_key_enc_1?: string | null;
  priv_key_enc_2?: string | null;
  tree_enc_key?: string | null;
  key_certificate?: BlindCertificate | null;
  key_certificate_signature?: string | null;
  key_fingerprint?: string | null;
}

export const createUser = (data: CreateUserDto) =>
  request<UserResponse>('/users', { method: 'POST', body: JSON.stringify(data) });

export const getUser = (id: string, token: string) =>
  request<UserResponse>(`/users/${id}`, { token });

export const listUsers = (token: string) =>
  request<UserResponse[]>('/users', { token });

export const updateUser = (id: string, token: string, data: Partial<CreateUserDto>) =>
  request<UserResponse>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data), token });

export const deleteUser = (id: string, token: string) =>
  request<void>(`/users/${id}`, { method: 'DELETE', token });

export const getOidcConnections = (id: string, token: string) =>
  request<OidcConnectionDto[]>(`/users/${id}/oidc-connections`, { token });

export const deleteOidcConnection = (id: string, token: string, provider: string) =>
  request<void>(`/users/${id}/oidc-connections/${provider}`, { method: 'DELETE', token });

// ── TOTP ─────────────────────────────────────────────────────────────────────

export const enableTotp = (id: string, token: string, secret: string, code: string) =>
  request<EnableTotpResponseDto>(`/users/${id}/totp/enable`, {
    method: 'POST',
    body: JSON.stringify({ secret, code }),
    token,
  });

export const disableTotp = (id: string, token: string) =>
  request<void>(`/users/${id}/totp/disable`, { method: 'POST', token });

export const renewTotpCodes = (id: string, token: string) =>
  request<{ recovery_codes: string[] }>(`/users/${id}/totp/renew-codes`, {
    method: 'POST',
    token,
  });
