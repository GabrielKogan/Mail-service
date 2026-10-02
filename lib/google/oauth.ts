import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { config } from '@/lib/config';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/postmaster.readonly',
  'openid',
  'email',
].join(' ');

export const STATE_COOKIE = 'mlc_google_oauth';
const STATE_TTL_MS = 10 * 60 * 1000;

export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid_grant' | 'config' | 'http' | 'state' = 'http'
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

function secret(): string {
  const cfg = config();
  const key = cfg.googleTokenKey || cfg.unsubscribeSecret;
  if (!key) throw new GoogleOAuthError('Falta GOOGLE_TOKEN_KEY', 'config');
  return key;
}

export function oauthRedirectUri(): string {
  const base = config().appBaseUrl;
  if (!base) throw new GoogleOAuthError('Falta APP_BASE_URL para el callback de Google', 'config');
  return `${base.replace(/\/$/, '')}/api/admin/google/callback`;
}

export function oauthRedirectAllowed(): { ok: true } | { ok: false; error: string } {
  const base = config().appBaseUrl;
  if (!base) return { ok: false, error: 'Falta APP_BASE_URL.' };
  try {
    const u = new URL(base);
    if (u.protocol === 'https:') return { ok: true };
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return { ok: true };
    return {
      ok: false,
      error: 'Google solo acepta https (o localhost). APP_BASE_URL tiene que ser https.',
    };
  } catch {
    return { ok: false, error: 'APP_BASE_URL no es una URL válida.' };
  }
}

export function googleConfigured(): boolean {
  const c = config();
  return Boolean(c.googleClientId && c.googleClientSecret && c.googleTokenKey);
}

export function signOAuthState(nonce: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ n: nonce, exp: now + STATE_TTL_MS })).toString(
    'base64url'
  );
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyOAuthState(
  state: string,
  nonce: string,
  now = Date.now()
): { ok: true } | { ok: false; error: string } {
  const dot = state.lastIndexOf('.');
  if (dot < 0) return { ok: false, error: 'state inválido' };
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: 'state adulterado' };
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      n?: string;
      exp?: number;
    };
    if (typeof data.exp !== 'number' || data.exp < now) return { ok: false, error: 'state vencido' };
    if (typeof data.n !== 'string' || data.n !== nonce) {
      return { ok: false, error: 'state de otro navegador' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'state inválido' };
  }
}

export function newNonce(): string {
  return randomBytes(16).toString('hex');
}

export function authorizationUrl(state: string): string {
  const c = config();
  if (!c.googleClientId) throw new GoogleOAuthError('Falta GOOGLE_CLIENT_ID', 'config');
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', c.googleClientId);
  u.searchParams.set('redirect_uri', oauthRedirectUri());
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', GOOGLE_SCOPES);
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', state);
  return u.toString();
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error) {
    const desc = json.error_description || json.error || `HTTP ${res.status}`;
    throw new GoogleOAuthError(desc, json.error === 'invalid_grant' ? 'invalid_grant' : 'http');
  }
  return json;
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email: string;
}> {
  const c = config();
  if (!c.googleClientId || !c.googleClientSecret) {
    throw new GoogleOAuthError('Falta GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET', 'config');
  }
  const json = await tokenRequest({
    code,
    client_id: c.googleClientId,
    client_secret: c.googleClientSecret,
    redirect_uri: oauthRedirectUri(),
    grant_type: 'authorization_code',
  });
  if (!json.access_token || !json.refresh_token) {
    throw new GoogleOAuthError(
      'Google no devolvió refresh_token. Revocá el acceso y conectá de nuevo con prompt=consent.',
      'http'
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in ?? 3600,
    email: emailFromIdToken(json.id_token) ?? '',
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const c = config();
  if (!c.googleClientId || !c.googleClientSecret) {
    throw new GoogleOAuthError('Falta GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET', 'config');
  }
  const json = await tokenRequest({
    refresh_token: refreshToken,
    client_id: c.googleClientId,
    client_secret: c.googleClientSecret,
    grant_type: 'refresh_token',
  });
  if (!json.access_token) throw new GoogleOAuthError('Google no devolvió access_token', 'http');
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 3600 };
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).catch(() => undefined);
}

function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      email?: string;
    };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAgeSec: number): {
  httpOnly: true;
  sameSite: 'lax';
  path: string;
  maxAge: number;
  secure: boolean;
} {
  const base = config().appBaseUrl ?? '';
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/admin/google',
    maxAge: maxAgeSec,
    secure: base.startsWith('https://'),
  };
}
